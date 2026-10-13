const crypto = require('crypto');

function constantTimeEqual(a, b) {
  const first = Buffer.from(String(a || ''), 'utf8');
  const second = Buffer.from(String(b || ''), 'utf8');
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function createPaymentSignature(orderId, paymentId, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

function verifyPaymentSignature({ orderId, paymentId, signature, secret }) {
  return constantTimeEqual(signature, createPaymentSignature(orderId, paymentId, secret));
}

module.exports = { constantTimeEqual, createPaymentSignature, verifyPaymentSignature };
