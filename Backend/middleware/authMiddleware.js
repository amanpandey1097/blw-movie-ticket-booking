const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized. Please log in.' });
  }

  try {
    const token = authorization.slice(7).trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -otp -otpExpires');

    if (!user) return res.status(401).json({ message: 'User no longer exists.' });
    if (user.status !== 'active') return res.status(403).json({ message: 'Account is not active.' });

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Session expired or invalid. Please log in again.' });
  }
};

exports.admin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  return next();
};
