const Redis = require('ioredis');

if (!process.env.REDIS_URL) {
  console.warn('REDIS_URL is not set. Seat locking will fail until Redis is configured.');
}

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
  connectTimeout: 10000,
  ...(process.env.REDIS_URL?.startsWith('rediss://') ? { tls: {} } : {}),
});

redis.on('connect', () => console.log('Redis connected for seat locking.'));
redis.on('error', (err) => console.error('Redis error:', err.message));

module.exports = redis;
