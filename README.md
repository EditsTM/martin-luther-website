# Martin Luther Oshkosh Website

Church and school website built with Node.js, Express, and static frontend assets.

## Tech Stack
- Node.js (ES Modules)
- Express 5
- better-sqlite3
- express-session
- multer
- nodemailer
- express-validator
- helmet

## Project Structure
- `server/` backend server, routes, middleware, controllers, and data access
- `public/` static frontend assets (HTML, CSS, JS, images, PDFs)
- `scripts/` utility scripts (security checks)
- `gen-2fa.js` helper script for admin 2FA setup

## Getting Started
1. Install dependencies:
   `npm install`
2. Configure environment variables in `.env`.
3. Start in development mode:
   `npm run dev`
4. Start in production mode:
   `npm start`

## Environment Variables
The following variables are currently used by the application:
- `PORT`
- `ALLOWED_ORIGINS`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `CONTACT_TO`
- `PRAYER_TO`
- `YOUTUBE_API_KEY`
- `CHANNEL_ID`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `ADMIN_TOTP_SECRET`

## NPM Scripts
- `npm start` run the server
- `npm run dev` run with `nodemon`
- `npm run security:check` run local security checks
- `npm run security:audit` run `npm audit` for production dependencies
- `npm run security:full` run both security checks and dependency audit

## Security Notes
- Session security is enforced with required `SESSION_SECRET`.
- Admin authentication expects password and TOTP secret configuration.
- Upload and request hardening are handled by middleware and validators.
- CSP, CORS, and secure headers are configured in `server/server.js`.

## Deployment Notes
- The server binds to `0.0.0.0` and uses `process.env.PORT` when provided.
- Static assets are served from `public/`.
- Ensure HTTPS is enabled in production so secure cookies can be enforced.
