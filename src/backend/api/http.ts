import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Pool, PoolClient } from "pg";

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function requireObject(value: unknown, name = "body"): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_REQUEST", `${name} must be an object.`);
  }
  return value as Record<string, any>;
}

export function requireString(
  value: unknown,
  name: string,
  maximumLength = 10_000,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "INVALID_REQUEST", `${name} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      `${name} must be ${maximumLength} characters or fewer.`,
    );
  }
  return normalized;
}

export function optionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value).trim() || null;
}

export function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export async function withTransaction<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function requireWriteAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const portalUser = res.locals.portalUser as
    | { localRole?: string }
    | undefined;
  if (portalUser?.localRole === "ADMIN" || portalUser?.localRole === "STAFF") {
    next();
    return;
  }

  const configuredToken = process.env.API_ADMIN_TOKEN?.trim();
  if (!configuredToken) {
    if (process.env.NODE_ENV === "production") {
      next(
        new HttpError(
          503,
          "WRITE_API_NOT_CONFIGURED",
          "API_ADMIN_TOKEN must be configured before production write access is enabled.",
        ),
      );
      return;
    }
    next();
    return;
  }

  const providedToken = req.header("x-admin-token")?.trim();
  if (providedToken !== configuredToken) {
    next(new HttpError(403, "FORBIDDEN", "A valid admin token is required."));
    return;
  }
  next();
}

export function apiErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  const pgError = error as { code?: string; constraint?: string };
  if (pgError?.code === "23505") {
    res.status(409).json({
      error: {
        code: "CONFLICT",
        message: "A record with the same unique value already exists.",
        constraint: pgError.constraint,
      },
    });
    return;
  }

  console.error("PostgreSQL API error:", error);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "The database request could not be completed.",
    },
  });
}
