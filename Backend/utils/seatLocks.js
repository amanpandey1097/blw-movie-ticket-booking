const redis = require('../config/redis');

const LOCK_TTL_SECONDS = Number(process.env.SEAT_LOCK_TTL_SECONDS || 600);

const lockKey = (movieId, seatId) => `lock:movie:${movieId}:seat:${seatId}`;

async function acquireSeatLocks(movieId, seatIds, owner) {
  const acquired = [];

  for (const seatId of seatIds) {
    const key = lockKey(movieId, seatId);
    const result = await redis.set(key, owner, 'EX', LOCK_TTL_SECONDS, 'NX');

    if (result !== 'OK') {
      await releaseSeatLocks(movieId, acquired, owner);
      return { ok: false, failedSeatId: seatId };
    }

    acquired.push(seatId);
  }

  return { ok: true };
}

async function releaseSeatLocks(movieId, seatIds, owner) {
  if (!seatIds?.length) return;

  const compareAndDelete = `
    if redis.call('get', KEYS[1]) == ARGV[1] then
      return redis.call('del', KEYS[1])
    else
      return 0
    end
  `;

  await Promise.all(
    seatIds.map((seatId) =>
      redis.eval(compareAndDelete, 1, lockKey(movieId, seatId), owner).catch(() => 0)
    )
  );
}

async function getLockedSeatIds(movieId, seatIds) {
  if (!seatIds?.length) return [];
  const keys = seatIds.map((seatId) => lockKey(movieId, seatId));
  const values = await redis.mget(keys);
  return seatIds.filter((_, index) => Boolean(values[index]));
}

async function locksBelongTo(movieId, seatIds, owner) {
  if (!seatIds?.length) return false;
  const keys = seatIds.map((seatId) => lockKey(movieId, seatId));
  const values = await redis.mget(keys);
  return values.every((value) => value === owner);
}

module.exports = {
  LOCK_TTL_SECONDS,
  acquireSeatLocks,
  releaseSeatLocks,
  getLockedSeatIds,
  locksBelongTo,
};
