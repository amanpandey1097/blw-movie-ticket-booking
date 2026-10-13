# Fixes Applied

## Booking
- Server-owned seat map and pricing.
- Invalid/duplicate seat validation.
- Redis seat locking before checkout.
- Confirmed-seat recheck before/after locks.
- Removed direct unpaid booking creation route.
- User ticket history sorted newest-first.

## Payments
- Server-side Razorpay order creation.
- Checkout session stored in MongoDB.
- HMAC uses server-stored order ID.
- Razorpay payment is fetched and checked for order, amount, currency and status.
- Authorized payments are captured.
- Idempotent confirmation via checkoutSession unique field.
- Automatic refund attempt when a captured payment cannot become a ticket.
- Checkout dismiss/failure releases locks.

## Authentication
- Admin registration requires ADMIN_INVITE_CODE.
- Test OTP exposure is gated behind AUTH_TEST_MODE.
- Optional Resend/Twilio OTP delivery path retained for non-test mode.
- Password minimum length increased to 8.
- Email/mobile normalization.
- JWT expiry reduced to 1 day.
- Protected routes require active account.
- Missing reject-user route implemented.

## Deployment
- Vercel SPA rewrite added.
- Render Blueprint included.
- Multi-origin CORS support added.
- Health endpoint checks Redis.
- Explicit show timezone offset added.
