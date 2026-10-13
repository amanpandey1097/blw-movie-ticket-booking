const mongoose = require('mongoose');

const checkoutSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  movie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Movie',
    required: true,
    index: true,
  },
  seats: [{
    seatId: { type: String, required: true },
    section: { type: String, required: true },
    price: { type: Number, required: true },
  }],
  totalAmount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  razorpayOrderId: { type: String, unique: true, required: true },
  razorpayPaymentId: { type: String, sparse: true },
  status: {
    type: String,
    enum: ['Pending', 'Paid', 'Cancelled', 'Failed', 'Refunded'],
    default: 'Pending',
    index: true,
  },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true });

module.exports = mongoose.model('CheckoutSession', checkoutSessionSchema);
