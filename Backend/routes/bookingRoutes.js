const express = require('express');
const router = express.Router();
const { getBookedSeats, getMyBookings } = require('../controllers/bookingController');
const { protect } = require('../middleware/authMiddleware');

router.get('/movie/:movieId', getBookedSeats);
router.get('/my-tickets', protect, getMyBookings);

module.exports = router;
