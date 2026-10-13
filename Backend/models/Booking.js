const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    index: true,
  },
  movie: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Movie',
    index: true,
  },
  checkoutSession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CheckoutSession',
    unique: true,
    sparse: true,
  },
  seats: [{
    seatId: { type: String, required: true },
    section: { type: String, required: true },
    price: { type: Number, required: true },
  }],
  totalAmount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  razorpayOrderId: { type: String, required: true },
  razorpayPaymentId: { type: String, required: true, unique: true },
  status: {
    type: String,
    enum: ['Confirmed', 'Cancelled', 'Refunded'],
    default: 'Confirmed',
    index: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
