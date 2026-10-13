const Booking = require('../models/Booking');
const { ALL_SEAT_IDS } = require('../utils/seatConfig');
const { getLockedSeatIds } = require('../utils/seatLocks');

// @desc Get seats that are unavailable because they are confirmed or temporarily locked
// @route GET /api/bookings/movie/:movieId
// @access Public
exports.getBookedSeats = async (req, res) => {
  try {
    const bookings = await Booking.find({
      movie: req.params.movieId,
      status: 'Confirmed',
    }).select('seats');

    const confirmed = new Set();
    bookings.forEach((booking) => {
      booking.seats.forEach((seat) => confirmed.add(seat.seatId));
    });

    let locked = [];
    try {
      locked = await getLockedSeatIds(req.params.movieId, ALL_SEAT_IDS);
    } catch (error) {
      console.error('Redis seat lookup failed:', error.message);
    }

    const unavailable = [...new Set([...confirmed, ...locked])];
    res.json(unavailable);
  } catch (error) {
    console.error('Fetch seats error:', error);
    res.status(500).json({ message: 'Server error fetching seats.' });
  }
};

// @desc Get logged-in user's confirmed bookings
// @route GET /api/bookings/my-tickets
// @access Private
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({
      user: req.user._id,
      status: 'Confirmed',
    })
      .populate('movie')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    console.error('Fetch tickets error:', error);
    res.status(500).json({ message: 'Error fetching tickets.' });
  }
};

// Deliberately block the legacy endpoint so unpaid bookings cannot be created.
exports.createBooking = async (_req, res) => {
  return res.status(405).json({
    message: 'Bookings can only be confirmed through the verified payment flow.',
  });
};
