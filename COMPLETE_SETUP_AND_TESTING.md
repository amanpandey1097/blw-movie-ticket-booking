# B.L.W MOVIE THEATRE — Complete Test & Deployment Build

This build keeps the original UI/features but secures the important flows for a real full-stack test deployment.

## Architecture

Browser (React/Vite on Vercel)
→ HTTPS REST API (Node/Express on Render)
→ MongoDB Atlas (users, movies, checkout sessions, confirmed tickets)
→ Redis/Upstash (temporary seat locks during checkout)
→ Razorpay Test Mode (payment order, verification, capture/refund)
→ Cloudinary (movie posters)

## Important fixes in this build

1. The backend, not the browser, now decides seat prices and total amount.
2. Selected seats are locked before Razorpay opens so two users cannot normally pay for the same seat.
3. Every Razorpay order is tied to a server-side checkout session.
4. Payment confirmation uses the order ID stored on the server for HMAC verification.
5. Payment ID/order/amount/currency/status are verified before a ticket is created.
6. Authorized payments are captured before ticket creation.
7. If a captured payment cannot become a booking, the server attempts a Razorpay refund.
8. The old direct POST /api/bookings route has been removed, so unpaid bookings cannot be created.
9. Public admin signup is no longer open: admin registration requires ADMIN_INVITE_CODE.
10. Test OTP is returned only when AUTH_TEST_MODE=true.
11. Missing reject-user backend functionality has been implemented.
12. Protected APIs now require an active user, not only a syntactically valid JWT.
13. React Router deep links work on Vercel through vercel.json.
14. Backend CORS supports a controlled comma-separated FRONTEND_URLS list.
15. Show expiry uses an explicit timezone offset (default +05:30).

---

# 1. Local prerequisites

Install:
- Node.js 20 or newer (Node 22 recommended)
- Git
- A MongoDB Atlas database
- An Upstash/Redis database
- Razorpay Test Mode API keys
- Cloudinary credentials

You do not need Twilio/Resend while AUTH_TEST_MODE=true.

---

# 2. Backend environment

Copy:

`Backend/.env.example` → `Backend/.env`

Fill values:

```env
PORT=5000
FRONTEND_URLS=http://localhost:5173
SHOW_TIMEZONE_OFFSET=+05:30

MONGO_URI=mongodb+srv://USER:PASSWORD@HOST/blw_cinema?retryWrites=true&w=majority
REDIS_URL=rediss://default:PASSWORD@HOST:PORT
SEAT_LOCK_TTL_SECONDS=600

JWT_SECRET=generate_a_long_random_secret
AUTH_TEST_MODE=true
ADMIN_INVITE_CODE=create_a_private_code_for_admin_signup

RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxx

CLOUDINARY_CLOUD_NAME=xxxxxxxxxx
CLOUDINARY_API_KEY=xxxxxxxxxx
CLOUDINARY_API_SECRET=xxxxxxxxxx
```

Generate a JWT secret, for example:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Never put `RAZORPAY_KEY_SECRET`, MongoDB password, Redis password, JWT secret, or Cloudinary API secret in frontend variables.

---

# 3. Frontend environment

Copy:

`blw-cinema-frontend/.env.example` → `blw-cinema-frontend/.env`

For local development:

```env
VITE_BACKEND_URL=http://localhost:5000
VITE_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxx
```

The Razorpay Key ID is public. The Key Secret must remain backend-only.

---

# 4. Run locally

Terminal 1:

```bash
cd Backend
npm ci
npm test
npm run dev
```

Backend should be available at:

`http://localhost:5000`

Health check:

`http://localhost:5000/health`

Expected when MongoDB and Redis are connected:

```json
{
  "status": "ok",
  "database": "ok",
  "redis": "ok"
}
```

Terminal 2:

```bash
cd blw-cinema-frontend
npm ci
npm run dev
```

Open:

`http://localhost:5173`

---

# 5. First admin account

1. Open Register.
2. Choose Admin.
3. Enter the same private value configured as `ADMIN_INVITE_CODE` on the backend.
4. With `AUTH_TEST_MODE=true`, the 6-digit OTP is returned by the API and automatically filled by the UI.
5. Verify OTP.
6. Log in.
7. Open Admin Panel.

For an internet-facing production deployment, set `AUTH_TEST_MODE=false` and configure Resend or Twilio before allowing public registrations.

---

# 6. Create a movie

From Admin Panel:

1. Enter title.
2. Enter genre.
3. Enter duration.
4. Pick a future show date.
5. Pick a future show time.
6. Select a poster image.
7. Publish.

The poster is uploaded to Cloudinary and the movie record is stored in MongoDB.

---

# 7. Normal user flow

1. Register as User.
2. Verify test OTP.
3. The account becomes `pending_approval`.
4. Admin opens Pending Users.
5. Approve the user.
6. User can now log in.

Also test rejection: register a second user and click Reject. That account should be deleted.

---

# 8. Razorpay test booking flow

1. Log in as an approved normal user.
2. Open a movie.
3. Select seats.
4. Click Confirm & Pay.
5. Backend validates the movie/seats and calculates the amount.
6. Redis locks the selected seats.
7. Backend creates a Razorpay Test Mode order.
8. Razorpay Checkout opens.
9. Complete a simulated successful payment.
10. Backend verifies signature, order, amount, currency, capture status and then creates the ticket.
11. The ticket appears under My Tickets.

The browser never sends a trusted total amount to the backend anymore.

---

# 9. Concurrency/duplicate-seat test

Use two different browsers/incognito windows with two approved users.

1. Both open the same movie.
2. User A selects A1 and starts checkout.
3. User B tries A1 while User A's checkout is active.
4. User B should see A1 unavailable or receive a 409 conflict when checkout starts.
5. Finish User A payment.
6. A1 must remain unavailable afterward because the confirmed booking is now in MongoDB.

Also test dismissing the Razorpay popup. The `/api/payments/cancel` call releases the temporary seat locks.

---

# 10. Failure tests

Test all of these before calling the project complete:

- Wrong login password → 401.
- User before approval → login blocked.
- Admin registration with wrong invite code → 403.
- Direct POST to `/api/bookings` → route unavailable; unpaid booking cannot be created.
- Invalid seat ID such as Z99 → payment order rejected.
- Duplicate seat IDs in one request → rejected.
- Modify the displayed frontend price → server still calculates original price.
- Razorpay failed test payment → no ticket is created and seats are released.
- Razorpay popup dismissed → seats are released.
- Confirmed seat chosen from another browser → checkout rejected.
- Refresh `/my-tickets` directly on deployed Vercel URL → React route should still load.
- My Tickets PDF download → PDF generated successfully.

---

# 11. Deploy MongoDB Atlas

Create a cluster and database user, then copy the Node connection string into `MONGO_URI`.

The application creates these collections automatically through Mongoose:

- users
- movies
- checkout sessions
- bookings

Do not store a MongoDB URI inside the frontend project.

---

# 12. Deploy Redis / Upstash

Create a Redis database and copy its TLS Redis URL into backend `REDIS_URL`.

Use the `rediss://` URL when your provider supplies TLS.

Redis is mandatory for the secure seat-locking flow in this build.

---

# 13. Razorpay Test Mode

In Razorpay Dashboard:

1. Switch to Test Mode.
2. Generate Test API keys.
3. Backend gets both Key ID and Key Secret.
4. Frontend gets only the Key ID.
5. Keep Test Mode enabled while validating the project.

Do not use live keys until the entire end-to-end flow has been tested.

---

# 14. Deploy backend to Render

Option A: use the included `render.yaml` as a Blueprint.

Option B: create a Web Service manually:

- Root Directory: `Backend`
- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check Path: `/health`

Add all backend environment variables in Render's Environment settings.

For the first deploy you can temporarily set:

```env
FRONTEND_URLS=http://localhost:5173
```

After Vercel gives you the final frontend URL, update it to something like:

```env
FRONTEND_URLS=https://your-project.vercel.app,http://localhost:5173
```

Get your Render API URL, for example:

`https://blw-cinema-api.onrender.com`

---

# 15. Deploy frontend to Vercel

Create a Vercel project from your GitHub repository.

Set:

- Root Directory: `blw-cinema-frontend`
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

Environment variables:

```env
VITE_BACKEND_URL=https://YOUR-RENDER-API.onrender.com
VITE_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxx
```

Deploy.

Then copy the Vercel URL back into backend `FRONTEND_URLS` and redeploy/restart the backend.

---

# 16. Final production safety switch

This package is configured for testing. Before a real public launch:

- Set `AUTH_TEST_MODE=false`.
- Configure real OTP delivery (Resend email or Twilio SMS).
- Rotate `ADMIN_INVITE_CODE` if it was shared during testing.
- Keep Razorpay in Test Mode until every failure case has passed.
- Later replace test keys with live keys on both services only when ready.
- Configure payment webhooks as an additional recovery/reconciliation mechanism for a real production system.

