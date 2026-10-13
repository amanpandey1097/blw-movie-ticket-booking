const User = require('../models/User');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const { Resend } = require('resend');

const AUTH_TEST_MODE = String(process.env.AUTH_TEST_MODE || 'false').toLowerCase() === 'true';

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1d' });
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const normalizeEmail = (email) => (email ? String(email).trim().toLowerCase() : undefined);
const normalizeMobile = (mobile) => {
  if (!mobile) return undefined;
  const value = String(mobile).replace(/[\s()-]/g, '');
  if (value.startsWith('+')) return value;
  if (/^\d{10}$/.test(value)) return `+91${value}`;
  return value;
};

const sendOtp = async ({ email, mobile, otp }) => {
  if (AUTH_TEST_MODE) return { testMode: true };

  if (email && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'B.L.W MOVIE THEATRE verification code',
      html: `<p>Your B.L.W MOVIE THEATRE verification code is <strong>${otp}</strong>.</p><p>This code expires in 10 minutes.</p>`,
    });
    return { channel: 'email' };
  }

  if (
    mobile &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  ) {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: `B.L.W MOVIE THEATRE verification code: ${otp}. It expires in 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: mobile,
    });
    return { channel: 'sms' };
  }

  throw new Error('No OTP delivery provider configured. Enable AUTH_TEST_MODE or configure Resend/Twilio.');
};

exports.registerUser = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = normalizeEmail(req.body.email);
    const mobile = normalizeMobile(req.body.mobile);
    const password = String(req.body.password || '');
    const requestedRole = req.body.role === 'admin' ? 'admin' : 'user';

    if (name.length < 2) return res.status(400).json({ message: 'Please enter your full name.' });
    if (!email && !mobile) return res.status(400).json({ message: 'Provide an email or mobile number.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (mobile && !/^\+[1-9]\d{7,14}$/.test(mobile)) {
      return res.status(400).json({ message: 'Enter a valid mobile number.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    if (requestedRole === 'admin') {
      if (!process.env.ADMIN_INVITE_CODE || req.body.adminInviteCode !== process.env.ADMIN_INVITE_CODE) {
        return res.status(403).json({ message: 'Invalid admin invite code.' });
      }
    }

    const searchConditions = [];
    if (email) searchConditions.push({ email });
    if (mobile) searchConditions.push({ mobile });

    const userExists = await User.findOne({ $or: searchConditions });
    if (userExists) {
      return res.status(409).json({ message: 'A user with this email or mobile number already exists.' });
    }

    const otp = generateOTP();
    const user = await User.create({
      name,
      email,
      mobile,
      password,
      role: requestedRole,
      status: 'unverified',
      otp,
      otpExpires: new Date(Date.now() + 10 * 60 * 1000),
    });

    try {
      const delivery = await sendOtp({ email, mobile, otp });
      const response = {
        message: AUTH_TEST_MODE
          ? 'Registration successful. Use the test OTP shown on screen.'
          : `Registration successful. Verification code sent by ${delivery.channel}.`,
        userId: user._id,
      };
      if (AUTH_TEST_MODE) response.otp = otp;
      return res.status(201).json(response);
    } catch (deliveryError) {
      await User.findByIdAndDelete(user._id);
      console.error('OTP delivery error:', deliveryError.message);
      return res.status(503).json({ message: deliveryError.message });
    }
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Server error during registration.' });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const user = await User.findById(req.body.userId);
    const enteredOtp = String(req.body.otp || '').trim();

    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.status !== 'unverified') return res.status(400).json({ message: 'Account is already verified.' });
    if (!user.otp || user.otp !== enteredOtp) return res.status(400).json({ message: 'Invalid OTP.' });
    if (!user.otpExpires || user.otpExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: 'OTP has expired. Register again to receive a new code.' });
    }

    user.otp = undefined;
    user.otpExpires = undefined;
    user.status = user.role === 'admin' ? 'active' : 'pending_approval';
    await user.save();

    return res.json({
      message: user.role === 'admin'
        ? 'Admin verified. You can now log in.'
        : 'OTP verified. Your account is waiting for admin approval.',
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    return res.status(500).json({ message: 'Server error during OTP verification.' });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const rawIdentifier = String(req.body.identifier || '').trim();
    const identifier = rawIdentifier.includes('@') ? rawIdentifier.toLowerCase() : normalizeMobile(rawIdentifier);
    const password = String(req.body.password || '');

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Enter your email/mobile and password.' });
    }

    const user = await User.findOne({
      $or: [{ email: identifier }, { mobile: identifier }],
    });

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    if (user.status === 'unverified') {
      return res.status(401).json({ message: 'Verify your OTP before logging in.' });
    }
    if (user.status === 'pending_approval') {
      return res.status(403).json({ message: 'Your account is waiting for admin approval.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ message: 'This account is not active.' });
    }

    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error during login.' });
  }
};

exports.getPendingUsers = async (_req, res) => {
  try {
    const pendingUsers = await User.find({ role: 'user', status: 'pending_approval' })
      .select('-password -otp -otpExpires')
      .sort({ createdAt: 1 });
    return res.json(pendingUsers);
  } catch (error) {
    console.error('Fetch pending users error:', error);
    return res.status(500).json({ message: 'Error fetching pending users.' });
  }
};

exports.approveUser = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'user' });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.status !== 'pending_approval') {
      return res.status(400).json({ message: 'User is not waiting for approval.' });
    }
    user.status = 'active';
    await user.save();
    return res.json({ message: 'User approved successfully.' });
  } catch (error) {
    console.error('Approve user error:', error);
    return res.status(500).json({ message: 'Error approving user.' });
  }
};

exports.rejectUser = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'user' });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.status !== 'pending_approval') {
      return res.status(400).json({ message: 'Only pending users can be rejected.' });
    }
    await user.deleteOne();
    return res.json({ message: 'User registration rejected.' });
  } catch (error) {
    console.error('Reject user error:', error);
    return res.status(500).json({ message: 'Error rejecting user.' });
  }
};
