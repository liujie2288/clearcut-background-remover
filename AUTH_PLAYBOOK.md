# Google OAuth + Cloudflare D1 Playbook

This project keeps a production-ready Google login implementation without exposing it in the MVP interface. Reuse it when an account creates real user value, such as saved work, paid plans, or cross-device access.

## Architecture

```text
Browser → /api/auth/google → Google consent
        → /api/auth/google/callback → D1 users + sessions
        → HttpOnly session cookie → /api/auth/session
```

Images are not part of this flow and are never stored in D1.

## Cloudflare resources

- Pages Functions: `functions/api/auth/[[path]].ts`
- D1 binding: `DB`
- Database: `clearcut-auth`
- Schema migration: `migrations/0001_auth.sql`
- Production secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## Google Cloud configuration

Create a Web application OAuth client and add this redirect URI:

```text
https://YOUR_DOMAIN/api/auth/google/callback
```

For a new site, replace `YOUR_DOMAIN`, set the two Cloudflare secrets, and update the Pages D1 binding in `wrangler.jsonc`.

## Endpoints

- `GET /api/auth/google` starts OAuth and saves a short-lived, one-time state in D1.
- `GET /api/auth/google/callback` exchanges the authorization code, upserts the user, creates a 30-day session, and sets an HttpOnly, Secure, SameSite=Lax cookie.
- `GET /api/auth/session` returns the minimal signed-in profile or `null`.
- `POST /api/auth/logout` removes the server-side session and expires the cookie.

## Product rule

Do not show a login button unless an account unlocks a clear feature. For privacy-first anonymous tools, leave this implementation deployed but hidden until users need account-only value.

## Security checklist

- Keep the client secret in Cloudflare Secrets, never Git.
- Use HTTPS and the production callback URI only.
- Keep OAuth state short-lived and delete it after use.
- Store a random session identifier in an HttpOnly cookie, not user data or OAuth tokens.
- Rotate a Google Client Secret if it was shared outside the intended secret manager.
