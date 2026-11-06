# The Counter

The Counter is a React + Express + MongoDB counter app with separate admin and staff workspaces. MongoDB stores products, settings, staff accounts and orders. Express provides the REST API, and JWTs authenticate the frontend.

## Requirements

- Node.js 20.19+ (or 22.12+)
- A MongoDB Atlas cluster, or a local MongoDB replica set

MongoDB transactions are used when placing an order so product stock and the sale are committed together. A standalone local MongoDB server does not support transactions; use Atlas or configure your local server as a replica set.

## First-time setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `MONGODB_URI` to your MongoDB connection string and replace `JWT_SECRET` with a random secret of at least 32 characters. Keep the backend `.env` private.
3. Set `ADMIN_NAME`, `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` (at least 8 characters; use a longer password for production). The password is only read by the initial-admin command.
4. Install frontend and backend dependencies, then create the initial admin:

   ```powershell
   npm install
   npm install --prefix backend
   npm run create-admin
   ```

   This creates one admin account and will stop if that email already exists.
5. Start both frontend and API:

   ```powershell
   npm run dev
   ```

6. Open the Vite URL (normally `http://localhost:5173`) and sign in with the admin email and password. Add products and create counter-staff accounts from the admin workspace.

Counter staff sign in with the username chosen by the admin and the password they set. Admins sign in with their email. Passwords are hashed with bcrypt before storage.

## Scripts

- `npm run dev` — starts the Vite frontend and Express API in watch mode.
- `npm run server:dev` — starts the API in watch mode (compatibility alias).
- `npm run server:start` — starts the API for production (compatibility alias).
- `npm run backend:dev` — starts only the Express API in watch mode.
- `npm run backend:start` — starts the API for production.
- `npm run create-admin` — creates the first admin using the `ADMIN_*` values in `.env`.
- `npm run build` — builds the frontend.
- `npm run lint` — runs Oxlint.

The standalone backend is in [`backend/`](./backend/), with its own `package.json`, dependencies, environment template and run scripts. The frontend proxies `/api` requests to `http://localhost:5000` in development. When frontend and API are deployed separately, set `VITE_API_URL` to the API origin at frontend build time and set `CLIENT_ORIGIN` to the deployed frontend origin in `backend/.env`. Multiple frontend origins may be comma-separated. Shared receipt links use the backend's request host and are bearer links that expire after seven days.

Do not expose `MONGODB_URI` or `JWT_SECRET` as `VITE_*` variables. For production, serve the frontend over HTTPS and use a strong private JWT secret.

## Backend behavior

- Admins can manage products, staff access and shop/GST settings, and view all orders.
- Counter staff can view inventory, create orders and advance only their own orders through payment and handover.
- Order IDs and seven-digit customer IDs are reserved by atomic MongoDB counters.
- Sale prices and GST are calculated by the API from current database records; the browser does not set trusted totals.
- Stock updates and order creation run in a MongoDB transaction.
- The API applies role checks, request validation, sign-in rate limiting and CORS origin restrictions.

The order screen places **Cigarettes** on the left, **Other food items** in the middle, and the bill on the right. The API returns at most the latest 100 orders per view.
