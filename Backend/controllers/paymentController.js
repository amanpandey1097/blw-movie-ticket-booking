const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const Booking = require('../models/Booking');
const CheckoutSession = require('../models/CheckoutSession');
const Movie = require('../models/Movie');
const { getSeatDetails, calculateTotal } = require('../utils/seatConfig');
const { constantTimeEqual, createPaymentSignature } = require('../utils/paymentSecurity');
const {
  LOCK_TTL_SECONDS,
  acquireSeatLocks,
  releaseSeatLocks,
  locksBelongTo,
} = require('../utils/seatLocks');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const findConflictingSeats = async (movieId, seatIds) => {
  const existing = await Booking.find({
    movie: movieId,
    status: 'Confirmed',
    'seats.seatId': { $in: seatIds },
  }).select('seats');

  const requested = new Set(seatIds);
  const conflicts = new Set();
  existing.forEach((booking) => {
    booking.seats.forEach((seat) => {
      if (requested.has(seat.seatId)) conflicts.add(seat.seatId);
    });
  });
  return [...conflicts];
};

const refundPayment = async (paymentId, amountInPaise) => {
  try {
    return await razorpay.payments.refund(paymentId, {
      amount: amountInPaise,
      notes: { reason: 'B.L.W MOVIE THEATRE booking could not be confirmed' },
    });
  } catch (error) {
    console.error('Automatic refund failed:', error?.error?.description || error.message);
    return null;
  }
};

// @desc Create a Razorpay order after validating and locking selected seats
// @route POST /api/payments/order
// @access Private
exports.createOrder = async (req, res) => {
  let lockOwner;
  let seatIds = [];
  let movieId;

  try {
    movieId = req.body.movieId;
    if (!mongoose.isValidObjectId(movieId)) {
      return res.status(400).json({ message: 'Invalid movie.' });
    }

    const seats = getSeatDetails(req.body.seatIds);
    seatIds = seats.map((seat) => seat.seatId);

    const movie = await Movie.findById(movieId);
    if (!movie) return res.status(404).json({ message: 'Movie not found.' });
    if (movie.expiresAt < new Date()) {
      return res.status(400).json({ message: 'This show has already ended.' });
    }

    const conflicts = await findConflictingSeats(movieId, seatIds);
    if (conflicts.length) {
      return res.status(409).json({
        message: `Seat(s) already booked: ${conflicts.join(', ')}`,
        seats: conflicts,
      });
    }

    const sessionObjectId = new mongoose.Types.ObjectId();
    lockOwner = sessionObjectId.toString();
    const lockResult = await acquireSeatLocks(movieId, seatIds, lockOwner);
    if (!lockResult.ok) {
      return res.status(409).json({
        message: `Seat ${lockResult.failedSeatId} is temporarily held by another customer.`,
      });
    }

    // Re-check MongoDB after acquiring all locks to close the read/lock race window.
    const conflictsAfterLock = await findConflictingSeats(movieId, seatIds);
    if (conflictsAfterLock.length) {
      await releaseSeatLocks(movieId, seatIds, lockOwner);
      return res.status(409).json({
        message: `Seat(s) already booked: ${conflictsAfterLock.join(', ')}`,
        seats: conflictsAfterLock,
      });
    }

    const totalAmount = calculateTotal(seats);
    const amountInPaise = totalAmount * 100;
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `blw_${sessionObjectId.toString().slice(-16)}`,
      notes: {
        checkoutSessionId: sessionObjectId.toString(),
        movieId: String(movieId),
        userId: String(req.user._id),
      },
    });

    const expiresAt = new Date(Date.now() + LOCK_TTL_SECONDS * 1000);
    const checkoutSession = await CheckoutSession.create({
      _id: sessionObjectId,
      user: req.user._id,
      movie: movieId,
      seats,
      totalAmount,
      currency: 'INR',
      razorpayOrderId: order.id,
      expiresAt,
    });

    return res.status(201).json({
      checkoutSessionId: checkoutSession._id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      expiresAt,
    });
  } catch (error) {
    if (lockOwner && movieId && seatIds.length) {
      await releaseSeatLocks(movieId, seatIds, lockOwner);
    }
    console.error('Create payment order error:', error?.error?.description || error.message);
    return res.status(500).json({
      message: 'Could not initialize payment. Check payment/Redis configuration and try again.',
    });
  }
};

// @desc Verify Razorpay response and create the booking
// @route POST /api/payments/confirm
// @access Private
exports.confirmPayment = async (req, res) => {
  const {
    checkoutSessionId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  if (!mongoose.isValidObjectId(checkoutSessionId)) {
    return res.status(400).json({ message: 'Invalid checkout session.' });
  }

  let checkout;
  let createdBooking = null;
  let paymentCaptured = false;
  let capturedAmountPaise = null;
  try {
    checkout = await CheckoutSession.findOne({
      _id: checkoutSessionId,
      user: req.user._id,
    });

    if (!checkout) return res.status(404).json({ message: 'Checkout session not found.' });

    const existingBooking = await Booking.findOne({ checkoutSession: checkout._id }).populate('movie');
    if (existingBooking) {
      return res.status(200).json({ message: 'Booking already confirmed.', booking: existingBooking });
    }

    if (checkout.status !== 'Pending') {
      return res.status(409).json({ message: `Checkout is already ${checkout.status.toLowerCase()}.` });
    }

    // Use the order id stored on our server, not the one supplied by the browser.
    if (!constantTimeEqual(razorpay_order_id, checkout.razorpayOrderId)) {
      return res.status(400).json({ message: 'Payment order mismatch.' });
    }

    const expectedSignature = createPaymentSignature(
      checkout.razorpayOrderId,
      razorpay_payment_id,
      process.env.RAZORPAY_KEY_SECRET
    );

    if (!constantTimeEqual(razorpay_signature, expectedSignature)) {
      checkout.status = 'Failed';
      await checkout.save();
      await releaseSeatLocks(
        checkout.movie.toString(),
        checkout.seats.map((seat) => seat.seatId),
        checkout._id.toString()
      );
      return res.status(400).json({ message: 'Invalid payment signature.' });
    }

    let payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (!payment || payment.order_id !== checkout.razorpayOrderId) {
      return res.status(400).json({ message: 'Payment could not be matched to this order.' });
    }

    const expectedPaise = checkout.totalAmount * 100;
    if (Number(payment.amount) !== expectedPaise || payment.currency !== checkout.currency) {
      return res.status(400).json({ message: 'Payment amount/currency mismatch.' });
    }

    if (payment.status === 'authorized') {
      payment = await razorpay.payments.capture(
        razorpay_payment_id,
        expectedPaise,
        checkout.currency
      );
    }

    if (payment.status !== 'captured') {
      return res.status(409).json({
        message: `Payment is ${payment.status}; booking is confirmed only after capture.`,
      });
    }

    paymentCaptured = true;
    capturedAmountPaise = expectedPaise;

    const movieId = checkout.movie.toString();
    const seatIds = checkout.seats.map((seat) => seat.seatId);
    let ownLocks = await locksBelongTo(movieId, seatIds, checkout._id.toString());

    // If the user took too long and locks expired, try to reacquire before finalizing.
    if (!ownLocks) {
      const conflicts = await findConflictingSeats(movieId, seatIds);
      if (conflicts.length) {
        const refund = await refundPayment(razorpay_payment_id, expectedPaise);
        checkout.status = refund ? 'Refunded' : 'Failed';
        checkout.razorpayPaymentId = razorpay_payment_id;
        await checkout.save();
        return res.status(409).json({
          message: refund
            ? 'Payment succeeded but the seat became unavailable. A test-mode refund was initiated.'
            : 'Payment succeeded but the seat became unavailable. Automatic refund failed; check Razorpay dashboard.',
        });
      }

      const reacquire = await acquireSeatLocks(movieId, seatIds, checkout._id.toString());
      ownLocks = reacquire.ok;
      if (!ownLocks) {
        const refund = await refundPayment(razorpay_payment_id, expectedPaise);
        checkout.status = refund ? 'Refunded' : 'Failed';
        checkout.razorpayPaymentId = razorpay_payment_id;
        await checkout.save();
        return res.status(409).json({
          message: refund
            ? 'Payment succeeded but seats could not be reserved. A test-mode refund was initiated.'
            : 'Payment succeeded but seats could not be reserved. Check Razorpay dashboard for manual refund.',
        });
      }
    }

    const conflictsBeforeSave = await findConflictingSeats(movieId, seatIds);
    if (conflictsBeforeSave.length) {
      await releaseSeatLocks(movieId, seatIds, checkout._id.toString());
      const refund = await refundPayment(razorpay_payment_id, expectedPaise);
      checkout.status = refund ? 'Refunded' : 'Failed';
      checkout.razorpayPaymentId = razorpay_payment_id;
      await checkout.save();
      return res.status(409).json({ message: 'Seats were already booked. Payment refund initiated.' });
    }

    createdBooking = await Booking.create({
      user: checkout.user,
      movie: checkout.movie,
      checkoutSession: checkout._id,
      seats: checkout.seats,
      totalAmount: checkout.totalAmount,
      currency: checkout.currency,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: razorpay_payment_id,
      status: 'Confirmed',
    });

    checkout.status = 'Paid';
    checkout.razorpayPaymentId = razorpay_payment_id;
    await checkout.save();
    await releaseSeatLocks(movieId, seatIds, checkout._id.toString());

    const populated = await createdBooking.populate('movie');
    return res.status(201).json({ message: 'Payment verified and booking confirmed.', booking: populated });
  } catch (error) {
    console.error('Confirm payment error:', error?.error?.description || error.message);

    if (checkout) {
      await releaseSeatLocks(
        checkout.movie.toString(),
        checkout.seats.map((seat) => seat.seatId),
        checkout._id.toString()
      );
    }

    // If the ticket was saved but only a later bookkeeping step failed, do not refund a valid booking.
    if (createdBooking) {
      try {
        if (checkout) {
          checkout.status = 'Paid';
          checkout.razorpayPaymentId = razorpay_payment_id;
          await checkout.save();
        }
      } catch (syncError) {
        console.error('Checkout session sync failed after booking creation:', syncError.message);
      }
      const populated = await createdBooking.populate('movie').catch(() => createdBooking);
      return res.status(201).json({
        message: 'Booking confirmed; a non-critical checkout sync step failed.',
        booking: populated,
      });
    }

    if (paymentCaptured && razorpay_payment_id && capturedAmountPaise) {
      const refund = await refundPayment(razorpay_payment_id, capturedAmountPaise);
      if (checkout) {
        checkout.status = refund ? 'Refunded' : 'Failed';
        checkout.razorpayPaymentId = razorpay_payment_id;
        await checkout.save().catch(() => {});
      }
      return res.status(500).json({
        message: refund
          ? 'Payment was captured but booking failed. An automatic test-mode refund was initiated.'
          : 'Payment was captured but booking failed and automatic refund failed. Check the Razorpay dashboard immediately.',
      });
    }

    return res.status(500).json({ message: 'Could not confirm payment. Please try again.' });
  }
};

// @desc Release seats when checkout is dismissed/failed before payment succeeds
// @route POST /api/payments/cancel
// @access Private
exports.cancelCheckout = async (req, res) => {
  try {
    const { checkoutSessionId } = req.body;
    if (!mongoose.isValidObjectId(checkoutSessionId)) {
      return res.status(400).json({ message: 'Invalid checkout session.' });
    }

    const checkout = await CheckoutSession.findOne({
      _id: checkoutSessionId,
      user: req.user._id,
    });

    if (!checkout) return res.status(404).json({ message: 'Checkout session not found.' });
    if (checkout.status !== 'Pending') return res.json({ message: 'Checkout already finalized.' });

    checkout.status = 'Cancelled';
    await checkout.save();
    await releaseSeatLocks(
      checkout.movie.toString(),
      checkout.seats.map((seat) => seat.seatId),
      checkout._id.toString()
    );

    return res.json({ message: 'Checkout cancelled and seats released.' });
  } catch (error) {
    console.error('Cancel checkout error:', error);
    return res.status(500).json({ message: 'Could not cancel checkout.' });
  }
};
