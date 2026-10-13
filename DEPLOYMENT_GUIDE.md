# B.L.W MOVIE THEATRE — local setup and deployment

This is an initial configuration pass, **not a certified working release**. Payment/booking security needs further changes before accepting real payments.

## Requirements
Node.js compatible with Vite 8 (Node 20.19+ or 22.12+), MongoDB Atlas, Redis with a redis:// or rediss:// URL, and Razorpay test credentials. Cloudinary and Twilio credentials are needed for their corresponding features.

## Run locally
1. Copy `Backend/.env.example` to `Backend/.env` and fill in real values. Never commit `.env`.
2. Copy `blw-cinema-frontend/.env.example` to `blw-cinema-frontend/.env` and fill in real values.
3. Terminal A: `cd Backend && npm ci && npm run dev`.
4. Terminal B: `cd blw-cinema-frontend && npm ci && npm run dev`.
5. Visit `http://localhost:5173` and check `http://localhost:5000/health`.

## Deploy
1. Create MongoDB Atlas and Redis instances; configure their network access and secrets.
2. Render Web Service: repository root directory `Backend`, build `npm ci`, start `npm start`; set environment variables from `Backend/.env.example` (not the sample values).
3. Vercel: root directory `blw-cinema-frontend`, framework Vite; set `VITE_BACKEND_URL=https://YOUR-RENDER-HOST` and `VITE_RAZORPAY_KEY_ID` to your test key.
4. Set Render `FRONTEND_URL=https://YOUR-VERCEL-HOST` and redeploy. Do not add a trailing slash to these URLs.
5. Test health, registration, login, admin movie management, seat selection, payment test mode, and booking history.

## Known security issues to fix before live payment
- Registration currently exposes OTPs in responses and permits self-requested admin roles.
- Payment signature verification and booking creation are separate; booking creation trusts user-submitted amount and does not require payment proof.
- Seat locking does not atomically prevent already-confirmed seats from being sold twice.
- Refund handling is not implemented, despite frontend messaging.
Do not switch Razorpay to live keys until these issues are resolved and end-to-end tests pass.
