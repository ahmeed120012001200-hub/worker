# Cloudflare Workers deployment

The Cloudflare Worker serves both the React frontend and the `/api` routes. It connects directly to Supabase; no separate Node hosting service or API base URL is needed.

## Configure Worker variables

In `wrangler.json`, replace the `CLOUDFLARE_ACCESS_TEAM_DOMAIN` and `CLOUDFLARE_ACCESS_AUD` placeholders with the team domain and audience tag from a Cloudflare Access self-hosted application protecting this Worker hostname. Keep `CORS_ALLOWED_ORIGINS` empty for a same-origin deployment.

Add Supabase values as Worker secrets, not in `wrangler.json` or the frontend build:

```powershell
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put SUPABASE_JWKS_URL
```

The Supabase secret key must remain a Worker secret. Configure the Cloudflare Access application with an allow policy for the intended users. The Worker independently checks the `Cf-Access-Jwt-Assertion` signature, issuer, audience, and expiry for every API route except the database health check.

## Deploy

```powershell
npm ci
npm run deploy:worker
```

Wrangler builds the app into `dist/client` and deploys those static assets together with the Worker API using `wrangler.json`. Alternatively, `npm run build` followed by `npx wrangler deploy` performs the same steps.

`GET /api/health` checks both Worker configuration and Supabase table connectivity. It returns `{"ok":true,"supabase":"connected"}` when ready; missing credentials or database errors return a JSON error. All data routes require Cloudflare Access.

For local Worker development, copy the Supabase values into an ignored `.dev.vars` file, use test Access settings or configure an Access-protected test deployment, then run `npm run dev:worker`.

The existing Express server remains available for local development with `npm run dev`; it is not the production Cloudflare entry point.
