import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import express from "express";
import type { Pool, PoolClient } from "pg";
import { v4 as uuidv4 } from "uuid";

const REQUIRED_ISSUER = "via-portal";
const SESSION_COOKIE = "__Host-via_cv_session";
const VIA_EMAIL_PATTERN = /^[^@\s]+@via-int\.com$/i;

type PortalRole = "user" | "admin";

interface PortalTokenPayload {
  iss: string;
  aud: string;
  appSlug: string;
  email: string;
  name: string;
  role: PortalRole;
  exp: number;
  nbf?: number;
}

export interface PortalSessionUser {
  id: string;
  email: string;
  name: string;
  role: PortalRole;
  localRole: "ADMIN" | "STAFF";
}

interface PortalSsoConfig {
  secret: string;
  issuer: typeof REQUIRED_ISSUER;
  audience: string;
  portalUrl: URL;
  publicUrl: URL;
  autoCreateUsers: boolean;
  sessionTtlHours: number;
  secureCookies: boolean;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for VIA Portal SSO.`);
  return value;
}

function parseHttpsUrl(value: string, name: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS.`);
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

function loadConfig(): PortalSsoConfig {
  const secret = requiredEnvironment("PORTAL_SSO_SECRET");
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("PORTAL_SSO_SECRET must contain at least 32 bytes.");
  }

  const issuer = requiredEnvironment("PORTAL_SSO_ISSUER");
  if (issuer !== REQUIRED_ISSUER) {
    throw new Error(`PORTAL_SSO_ISSUER must be exactly ${REQUIRED_ISSUER}.`);
  }

  const audience = requiredEnvironment("PORTAL_SSO_AUDIENCE");
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(audience)) {
    throw new Error("PORTAL_SSO_AUDIENCE must be a valid lowercase app slug.");
  }

  const ttl = Number.parseInt(process.env.PORTAL_SESSION_TTL_HOURS || "12", 10);
  const sessionTtlHours = Number.isFinite(ttl)
    ? Math.max(1, Math.min(168, ttl))
    : 12;

  return {
    secret,
    issuer: REQUIRED_ISSUER,
    audience,
    portalUrl: parseHttpsUrl(requiredEnvironment("PORTAL_URL"), "PORTAL_URL"),
    publicUrl: parseHttpsUrl(
      requiredEnvironment("APP_PUBLIC_URL"),
      "APP_PUBLIC_URL",
    ),
    autoCreateUsers:
      process.env.PORTAL_SSO_AUTO_CREATE_USERS?.trim().toLowerCase() !== "false",
    sessionTtlHours,
    secureCookies: true,
  };
}

function decodeJsonSegment(segment: string): Record<string, unknown> {
  try {
    const decoded = Buffer.from(segment, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JWT segment is not an object.");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("The portal token is malformed.");
  }
}

function verifyPortalToken(token: string, config: PortalSsoConfig): PortalTokenPayload {
  if (token.length > 16_384) throw new Error("The portal token is too large.");
  const segments = token.split(".");
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw new Error("The portal token must be a signed JWT.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeJsonSegment(encodedHeader);
  if (header.alg !== "HS256") {
    throw new Error("The portal token must use HS256.");
  }

  const suppliedSignature = Buffer.from(encodedSignature, "base64url");
  const expectedSignature = createHmac("sha256", config.secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new Error("The portal token signature is invalid.");
  }

  const payload = decodeJsonSegment(encodedPayload);
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== config.issuer) throw new Error("Invalid token issuer.");
  if (payload.aud !== config.audience) throw new Error("Invalid token audience.");
  if (payload.appSlug !== config.audience) throw new Error("Invalid token appSlug.");
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp <= now) {
    throw new Error("The portal token is expired or has no valid expiry.");
  }
  if (payload.nbf !== undefined && (typeof payload.nbf !== "number" || payload.nbf > now)) {
    throw new Error("The portal token is not active yet.");
  }
  if (typeof payload.email !== "string" || !VIA_EMAIL_PATTERN.test(payload.email)) {
    throw new Error("The portal token does not contain a VIA Workspace email.");
  }
  if (typeof payload.name !== "string" || !payload.name.trim()) {
    throw new Error("The portal token does not contain a display name.");
  }
  if (payload.role !== "user" && payload.role !== "admin") {
    throw new Error("The portal token contains an unsupported role.");
  }

  return {
    iss: config.issuer,
    aud: config.audience,
    appSlug: config.audience,
    email: payload.email.toLowerCase(),
    name: payload.name.trim(),
    role: payload.role,
    exp: payload.exp,
    ...(typeof payload.nbf === "number" ? { nbf: payload.nbf } : {}),
  };
}

function sessionHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function setSessionCookie(res: Response, token: string, config: PortalSsoConfig) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: config.sessionTtlHours * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res: Response, config: PortalSsoConfig) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "lax",
    path: "/",
  });
}

function cleanCallbackPath(req: Request): string {
  const url = new URL(req.originalUrl, "https://local.invalid");
  url.searchParams.delete("portal_token");
  return `${url.pathname}${url.search}` || "/";
}

function appReturnUrl(req: Request, config: PortalSsoConfig): URL {
  const requested = typeof req.query.returnTo === "string" ? req.query.returnTo : "";
  if (requested.startsWith("/") && !requested.startsWith("//")) {
    return new URL(requested, config.publicUrl);
  }
  if (requested) {
    try {
      const candidate = new URL(requested);
      if (candidate.origin === config.publicUrl.origin) return candidate;
    } catch {
      // Fall back to the current app page.
    }
  }
  if (req.originalUrl.startsWith("/api/auth/login")) {
    return new URL("/dashboard", config.publicUrl);
  }
  return new URL(cleanCallbackPath(req), config.publicUrl);
}

function portalLoginUrl(returnTo: URL, config: PortalSsoConfig): string {
  const login = new URL("/auth/google", config.portalUrl);
  login.searchParams.set("returnTo", returnTo.toString());
  return login.toString();
}

async function findOrCreateUser(
  client: PoolClient,
  payload: PortalTokenPayload,
  config: PortalSsoConfig,
): Promise<PortalSessionUser> {
  let result = await client.query<{
    id: string;
    name: string;
    email: string;
    role_code: string | null;
    status_code: string | null;
  }>("SELECT id, name, email, role_code, status_code FROM users WHERE LOWER(email) = $1 FOR UPDATE", [payload.email]);

  if (!result.rowCount) {
    if (!config.autoCreateUsers) throw new Error("This VIA user has not been provisioned in the app.");
    await client.query(
      `INSERT INTO users (id, name, email, role_code, status_code, data)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5::JSONB)
       ON CONFLICT DO NOTHING`,
      [
        uuidv4(),
        payload.name,
        payload.email,
        payload.role === "admin" ? "ADMIN" : "STAFF",
        JSON.stringify({
          fullName: payload.name,
          email: payload.email,
          role: payload.role === "admin" ? "Admin" : "Staff",
          status: "Active",
          ssoProvider: "via-portal",
        }),
      ],
    );
    result = await client.query(
      "SELECT id, name, email, role_code, status_code FROM users WHERE LOWER(email) = $1 FOR UPDATE",
      [payload.email],
    );
  }

  const user = result.rows[0];
  if (!user) throw new Error("Unable to link the VIA user account.");
  if (user.status_code === "DISABLED") throw new Error("This local app account is disabled.");

  const localRole = payload.role === "admin" ? "ADMIN" : "STAFF";
  const lastLogin = new Date().toISOString();
  await client.query(
    `UPDATE users
     SET name = $2,
         email = $3,
         role_code = $4,
         status_code = 'ACTIVE',
         data = data || $5::JSONB,
         updated_at = NOW()
     WHERE id = $1`,
    [
      user.id,
      payload.name,
      payload.email,
      localRole,
      JSON.stringify({
        fullName: payload.name,
        email: payload.email,
        role: payload.role === "admin" ? "Admin" : "Staff",
        status: "Active",
        ssoProvider: "via-portal",
        lastLogin,
      }),
    ],
  );

  return { id: user.id, email: payload.email, name: payload.name, role: payload.role, localRole };
}

async function createSession(
  pool: Pool,
  payload: PortalTokenPayload,
  req: Request,
  config: PortalSsoConfig,
): Promise<{ token: string; user: PortalSessionUser }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await findOrCreateUser(client, payload, config);
    const token = randomBytes(32).toString("base64url");
    await client.query(
      `INSERT INTO portal_sessions
         (session_hash, user_id, expires_at, user_agent, ip_address)
       VALUES ($1, $2, NOW() + ($3::INTEGER * INTERVAL '1 hour'), $4, $5)`,
      [
        sessionHash(token),
        user.id,
        config.sessionTtlHours,
        String(req.get("user-agent") || "").slice(0, 1000) || null,
        req.ip || null,
      ],
    );
    await client.query(
      `INSERT INTO activity_logs (id, user_id, action, detail, status_code, data)
       VALUES ($1, $2, 'SSO_LOGIN', $3, 'SUCCESS', $4::JSONB)`,
      [uuidv4(), user.id, `SSO login for ${user.email}`, JSON.stringify({ provider: "via-portal" })],
    );
    await client.query("DELETE FROM portal_sessions WHERE expires_at <= NOW() OR revoked_at IS NOT NULL");
    await client.query("COMMIT");
    return { token, user };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function sessionUser(pool: Pool, token: string): Promise<PortalSessionUser | null> {
  const result = await pool.query<{
    id: string;
    email: string;
    name: string;
    role_code: "ADMIN" | "STAFF";
  }>(
    `SELECT u.id, u.email, u.name, u.role_code
     FROM portal_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND u.status_code = 'ACTIVE'
       AND u.role_code IN ('ADMIN', 'STAFF')`,
    [sessionHash(token)],
  );
  if (!result.rowCount) return null;
  const user = result.rows[0];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    localRole: user.role_code,
    role: user.role_code === "ADMIN" ? "admin" : "user",
  };
}

function isPublicAsset(pathname: string): boolean {
  return pathname.startsWith("/assets/") || pathname === "/favicon.ico";
}

export function createPortalSso(pool: Pool) {
  const config = loadConfig();
  const router = express.Router();

  const consumePortalToken: RequestHandler = async (req, res, next) => {
    const portalToken = typeof req.query.portal_token === "string" ? req.query.portal_token : null;
    if (!portalToken) return next();
    if (req.method !== "GET") return res.status(400).send("Portal tokens are accepted only on GET callbacks.");
    if (!req.secure) {
      return res.status(400).send("VIA Portal callbacks require HTTPS.");
    }
    try {
      const payload = verifyPortalToken(portalToken, config);
      const session = await createSession(pool, payload, req, config);
      res.setHeader("Cache-Control", "no-store");
      setSessionCookie(res, session.token, config);
      res.redirect(303, cleanCallbackPath(req));
    } catch (error) {
      console.error("VIA Portal SSO callback rejected:", error instanceof Error ? error.message : error);
      res.status(401).send("VIA Portal authentication could not be verified.");
    }
  };

  const requireSession: RequestHandler = (req, res, next) => {
    void (async () => {
      if (isPublicAsset(req.path) || req.path === "/api/v2/health" || req.path === "/api/auth/login") {
        return next();
      }
      const token = cookieValue(req, SESSION_COOKIE);
      const user = token ? await sessionUser(pool, token) : null;
      if (user) {
        res.locals.portalUser = user;
        return next();
      }
      if (req.path.startsWith("/api/")) {
        return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "VIA Portal authentication is required." } });
      }
      res.redirect(302, portalLoginUrl(appReturnUrl(req, config), config));
    })().catch((error) => {
      console.error("VIA Portal session validation failed:", error);
      res.status(500).json({ error: { code: "SESSION_ERROR", message: "The VIA session could not be validated." } });
    });
  };

  router.get("/login", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, portalLoginUrl(appReturnUrl(req, config), config));
  });
  router.get("/me", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ user: res.locals.portalUser as PortalSessionUser });
  });
  router.post("/logout", (req, res) => {
    void (async () => {
      const token = cookieValue(req, SESSION_COOKIE);
      if (token) {
        await pool.query("UPDATE portal_sessions SET revoked_at = NOW() WHERE session_hash = $1", [sessionHash(token)]);
      }
      res.setHeader("Cache-Control", "no-store");
      clearSessionCookie(res, config);
      res.json({ redirectTo: config.portalUrl.toString() });
    })().catch((error) => {
      console.error("VIA Portal logout failed:", error);
      res.status(500).json({ error: { code: "LOGOUT_ERROR", message: "The VIA session could not be ended." } });
    });
  });

  return { consumePortalToken, requireSession, router };
}
