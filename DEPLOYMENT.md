# Cloudflare frontend and Node API deployment

The frontend can be hosted on Cloudflare, but the API must run as a Node.js service. A Cloudflare `workers.dev` static deployment does not run `server/index.js`.

## 1. Deploy the Node API

Use a Node.js 22 service with the repository root as its working directory:

- Build command: `npm ci`
- Start command: `npm start`

Configure these environment variables on the API service; never put the Supabase secret key in Cloudflare's frontend build variables:

- `NODE_ENV=production`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_JWKS_URL`
- `CORS_ALLOWED_ORIGINS=https://your-app.example.com`
- `CLOUDFLARE_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com`
- `CLOUDFLARE_ACCESS_AUD=<the API Access application's AUD tag>`

The production API refuses to start if its Access issuer, audience, or allowed frontend origins are missing. Its `/api/health` endpoint is public for health checks; all other API routes require a valid Cloudflare Access JWT.

## 2. Put both hostnames behind Cloudflare Access

Use custom hostnames in a Cloudflare-managed DNS zone for both the frontend and API, and create a Cloudflare Access self-hosted application and allow policy for each hostname. The API request must pass through the API's Access application so Cloudflare adds `Cf-Access-Jwt-Assertion`; the Node service independently verifies its issuer, audience, expiry, and signature. A direct request to the Node provider hostname without that assertion is rejected.

The frontend's `workers.dev` hostname must not remain a public bypass around the protected custom hostname. Disable the `workers.dev` route after configuring the custom domain. Configure Cloudflare Access to permit CORS preflight `OPTIONS` requests to the API while keeping the actual API routes protected.

## 3. Build and deploy the frontend

Set this Cloudflare build variable before building:

- `VITE_API_BASE_URL=https://your-api.example.com`

Build command: `npm ci && npm run build`. Publish the generated `dist/client` directory. Set `CORS_ALLOWED_ORIGINS` on the API to the exact frontend origin (scheme and hostname, no path). For separate subdomains, configure the Cloudflare Access cookie domain so the authenticated session is available to the API hostname.

After deployment, verify that `https://your-api.example.com/api/health` returns `{"ok":true}`, and that the protected frontend can load `/api/state`. A JSON/API error is shown in the page if the API hostname or Access configuration is incorrect.
