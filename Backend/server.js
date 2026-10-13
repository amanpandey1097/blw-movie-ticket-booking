const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const connectDB = require('./config/db');
const redis = require('./config/redis');
const authRoutes = require('./routes/authRoutes');
const movieRoutes = require('./routes/movieRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();
const allowedOrigins = String(process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => res.send('B.L.W MOVIE THEATRE API is running.'));
app.get('/health', async (_req, res) => {
  let redisStatus = 'down';
  try {
    redisStatus = (await redis.ping()) === 'PONG' ? 'ok' : 'down';
  } catch (_error) {
    redisStatus = 'down';
  }

  res.status(redisStatus === 'ok' ? 200 : 503).json({
    status: redisStatus === 'ok' ? 'ok' : 'degraded',
    database: 'ok',
    redis: redisStatus,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);

app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }));
app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err.message);
  if (err.message === 'Origin not allowed by CORS') {
    return res.status(403).json({ message: 'Origin not allowed by CORS.' });
  }
  return res.status(500).json({ message: 'Internal server error.' });
});

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
