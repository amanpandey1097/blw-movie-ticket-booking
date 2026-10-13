const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  verifyOTP,
  getPendingUsers,
  approveUser,
  rejectUser,
} = require('../controllers/authController');
const { protect, admin } = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/verify-otp', verifyOTP);
router.get('/pending-users', protect, admin, getPendingUsers);
router.put('/approve-user/:id', protect, admin, approveUser);
router.delete('/reject-user/:id', protect, admin, rejectUser);

module.exports = router;
