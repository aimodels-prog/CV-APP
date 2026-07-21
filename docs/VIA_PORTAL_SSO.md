# VIA Portal SSO

The application uses VIA Portal as its only interactive login. There is no local username/password login for VIA staff.

## Portal registration

```text
App slug: via-cv-generation
Audience: via-cv-generation
Issuer: via-portal
Callback/dashboard path: /dashboard
Production callback: https://<app-domain>/dashboard
```

The portal may return a user to any application path supplied in `returnTo`. The server consumes `portal_token` on that path, creates the local session, and redirects to the same path without the token query parameter.

## Runtime environment

```text
PORTAL_SSO_SECRET=<same strong secret configured in VIA Portal>
PORTAL_SSO_ISSUER=via-portal
PORTAL_SSO_AUDIENCE=via-cv-generation
PORTAL_URL=https://portal.via-int.com
APP_PUBLIC_URL=https://<app-domain>
PORTAL_SSO_AUTO_CREATE_USERS=true
PORTAL_SESSION_TTL_HOURS=12
```

On DigitalOcean App Platform, `APP_PUBLIC_URL` can use the `${APP_URL}` bindable value until a custom domain is assigned. Store `PORTAL_SSO_SECRET` as an encrypted run-time variable. Never expose it through a `VITE_` variable.

## Security behavior

- Only signed HS256 tokens are accepted.
- `iss`, `aud`, `appSlug`, `exp`, VIA email domain, display name and role are validated.
- Portal `admin` maps to local `ADMIN`; portal `user` maps to local `STAFF`.
- New authorized VIA users are created when auto-creation is enabled.
- A locally disabled user remains denied.
- The browser receives an opaque, Secure, HttpOnly, SameSite=Lax cookie. Only its SHA-256 hash is stored in PostgreSQL.
- All application APIs and pages require the local session, except static assets, the login redirect, and the health endpoint.
- Signing out revokes the database session and returns the user to VIA Portal.
