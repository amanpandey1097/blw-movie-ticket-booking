const express = require('express');
const router = express.Router();
const { createOrder, confirmPayment, cancelCheckout } = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

router.post('/order', protect, createOrder);
router.post('/confirm', protect, confirmPayment);
router.post('/cancel', protect, cancelCheckout);

module.exports = router;
