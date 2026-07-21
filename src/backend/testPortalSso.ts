import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import express from "express";
import { createPortalSso } from "./auth/portalSso.ts";

type QueryResult = { rows: any[]; rowCount: number };

class FakeDatabase {
  user: any = null;
  sessions = new Map<string, { userId: string; revoked: boolean }>();

  async connect() {
    return {
      query: (sql: string, params: any[] = []) => this.query(sql, params),
      release: () => undefined,
    };
  }

  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.startsWith("SELECT id, name, email, role_code, status_code FROM users")) {
      return this.user ? { rows: [this.user], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("INSERT INTO users")) {
      this.user = {
        id: params[0],
        name: params[1],
        email: params[2],
        role_code: params[3],
        status_code: "ACTIVE",
      };
    }
    if (normalized.startsWith("UPDATE users")) {
      this.user = {
        ...this.user,
        name: params[1],
        email: params[2],
        role_code: params[3],
        status_code: "ACTIVE",
      };
    }
    if (normalized.startsWith("INSERT INTO portal_sessions")) {
      this.sessions.set(params[0], { userId: params[1], revoked: false });
    }
    if (normalized.startsWith("SELECT u.id, u.email, u.name, u.role_code")) {
      const session = this.sessions.get(params[0]);
      return session && !session.revoked && this.user
        ? { rows: [this.user], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("UPDATE portal_sessions SET revoked_at")) {
      const session = this.sessions.get(params[0]);
      if (session) session.revoked = true;
    }
    return { rows: [], rowCount: 0 };
  }
}

function jwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

async function run() {
  const secret = "test-secret-with-at-least-thirty-two-bytes";
  process.env.NODE_ENV = "test";
  process.env.PORTAL_SSO_SECRET = secret;
  process.env.PORTAL_SSO_ISSUER = "via-portal";
  process.env.PORTAL_SSO_AUDIENCE = "via-cv-generation";
  process.env.PORTAL_URL = "https://portal.via-int.com";

  const database = new FakeDatabase();
  const sso = createPortalSso(database as any);
  const app = express();
  app.set("trust proxy", 1);
  app.use(sso.consumePortalToken);
  app.use(sso.requireSession);
  app.use("/api/auth", sso.router);
  app.get("/dashboard", (_req, res) => res.send("dashboard"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start.");
  const base = `http://127.0.0.1:${address.port}`;

  try {
    const direct = await fetch(`${base}/dashboard`, { redirect: "manual" });
    assert.equal(direct.status, 302);
    const portalRedirect = new URL(direct.headers.get("location") || "");
    assert.equal(portalRedirect.origin, "https://portal.via-int.com");
    assert.equal(portalRedirect.pathname, "/");
    assert.equal(portalRedirect.search, "");

    const now = Math.floor(Date.now() / 1000);
    const basePayload = {
      iss: "via-portal",
      aud: "via-cv-generation",
      appSlug: "via-cv-generation",
      email: "user@via-int.com",
      name: "VIA User",
      role: "user",
      exp: now + 300,
    };
    const wrongAudience = jwt({ ...basePayload, aud: "other-app" }, secret);
    const secureCallbackHeaders = { "x-forwarded-proto": "https" };
    const rejected = await fetch(`${base}/dashboard?portal_token=${encodeURIComponent(wrongAudience)}`, {
      redirect: "manual",
      headers: secureCallbackHeaders,
    });
    assert.equal(rejected.status, 401);

    const unsignedHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const unsignedPayload = Buffer.from(JSON.stringify(basePayload)).toString("base64url");
    const unsigned = `${unsignedHeader}.${unsignedPayload}.unsigned`;
    const unsignedResponse = await fetch(`${base}/dashboard?portal_token=${encodeURIComponent(unsigned)}`, {
      redirect: "manual",
      headers: secureCallbackHeaders,
    });
    assert.equal(unsignedResponse.status, 401);

    const expired = jwt({ ...basePayload, exp: now - 1 }, secret);
    const expiredResponse = await fetch(`${base}/dashboard?portal_token=${encodeURIComponent(expired)}`, {
      redirect: "manual",
      headers: secureCallbackHeaders,
    });
    assert.equal(expiredResponse.status, 401);

    const token = jwt(basePayload, secret);
    const callback = await fetch(`${base}/dashboard?view=tenders&portal_token=${encodeURIComponent(token)}`, {
      redirect: "manual",
      headers: secureCallbackHeaders,
    });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get("location"), "/dashboard?view=tenders");
    const setCookie = callback.headers.get("set-cookie") || "";
    assert.match(setCookie, /__Host-via_cv_session=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Lax/i);
    const cookie = setCookie.split(";", 1)[0];

    const me = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
    assert.equal(me.status, 200);
    const identity = await me.json() as any;
    assert.equal(identity.user.email, "user@via-int.com");
    assert.equal(identity.user.localRole, "STAFF");

    const logout = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { cookie } });
    assert.equal(logout.status, 200);
    const afterLogout = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
    assert.equal(afterLogout.status, 401);
    console.log("VIA Portal SSO integration checks passed.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

run().catch((error) => {
  console.error("VIA Portal SSO integration checks failed:", error);
  process.exitCode = 1;
});
