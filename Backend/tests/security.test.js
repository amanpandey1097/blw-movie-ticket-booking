const test = require('node:test');
const assert = require('node:assert/strict');
const { getSeatDetails, calculateTotal, normalizeSeatIds } = require('../utils/seatConfig');
const { createPaymentSignature, verifyPaymentSignature } = require('../utils/paymentSecurity');

test('seat pricing is calculated only from server configuration', () => {
  const seats = getSeatDetails(['A1', 'D1', 'K1']);
  assert.deepEqual(seats.map((seat) => seat.price), [30, 20, 15]);
  assert.equal(calculateTotal(seats), 65);
});

test('duplicate and invalid seats are rejected', () => {
  assert.throws(() => normalizeSeatIds(['A1', 'A1']), /Duplicate seats/);
  assert.throws(() => normalizeSeatIds(['Z99']), /Invalid seat/);
});

test('Razorpay HMAC signature verification rejects tampering', () => {
  const secret = 'test_secret';
  const orderId = 'order_test_123';
  const paymentId = 'pay_test_456';
  const signature = createPaymentSignature(orderId, paymentId, secret);
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature, secret }), true);
  assert.equal(verifyPaymentSignature({ orderId, paymentId: 'pay_changed', signature, secret }), false);
});
