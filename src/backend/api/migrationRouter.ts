import express from "express";
import type { Pool, PoolClient } from "pg";
import LZString from "lz-string";
import { v4 as uuidv4 } from "uuid";
import {
  asyncRoute,
  HttpError,
  requireObject,
  requireWriteAccess,
  withTransaction,
} from "./http.ts";

const COLLECTION_TABLES = {
  experts: "experts",
  tenders: "tenders",
  matches: "matches",
  cvs: "generated_cvs",
  logs: "activity_logs",
  users: "users",
  brandings: "brandings",
} as const;

type CollectionName = keyof typeof COLLECTION_TABLES;

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function array(value: unknown): Record<string, any>[] {
  return Array.isArray(value) ? value.map(object) : [];
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function timestamp(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function recordId(record: Record<string, any>, prefix: string): string {
  return text(record.id) || `${prefix}_${uuidv4()}`;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string" || !value) return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function rawStoredApplicationData(rawStorage: Record<string, any>) {
  const stored = text(rawStorage.via_enterprise_v1);
  if (!stored) return {};
  try {
    if (stored.startsWith("{") || stored.startsWith("[")) {
      return object(JSON.parse(stored));
    }
    const decompressed = LZString.decompressFromUTF16(stored);
    return decompressed ? object(JSON.parse(decompressed)) : {};
  } catch {
    return {};
  }
}

function snapshotFromBody(bodyValue: unknown) {
  const body = requireObject(bodyValue);
  const snapshot = object(body.snapshot || body);
  if (
    snapshot.format !== "via-browser-migration-snapshot" &&
    snapshot.format !== "via-browser-data-backup"
  ) {
    throw new HttpError(
      400,
      "INVALID_MIGRATION_SNAPSHOT",
      "The request is not a recognized VIA browser migration snapshot.",
    );
  }
  const rawStorage = object(snapshot.rawStorage);
  const appData = {
    ...rawStoredApplicationData(rawStorage),
    ...object(snapshot.decodedAppData),
    ...object(snapshot.appData),
  };
  const explicitPreferences = object(snapshot.preferences);
  const preferences = {
    profileSettings:
      explicitPreferences.profileSettings ??
      parseJsonValue(rawStorage.profileSettings),
    hiddenModules:
      explicitPreferences.hiddenModules ??
      parseJsonValue(rawStorage.hidden_modules_prefs),
    pendingTender:
      explicitPreferences.pendingTender ??
      parseJsonValue(rawStorage.pendingTender),
    pendingExpert:
      explicitPreferences.pendingExpert ??
      parseJsonValue(rawStorage.pendingExpert),
    lastNotificationCheck:
      explicitPreferences.lastNotificationCheck ??
      parseJsonValue(rawStorage.lastNotificationCheck),
    deadlineAck:
      explicitPreferences.deadlineAck ?? parseJsonValue(rawStorage.deadlineAck),
  };

  const collections = {
    experts: array(appData.experts),
    tenders: array(appData.tenders),
    matches: array(appData.matches),
    cvs: array(appData.cvs),
    logs: array(appData.logs),
    users: array(appData.users),
    brandings: array(appData.brandings),
  };

  for (const [name, records] of Object.entries(collections)) {
    if (records.length > 25_000) {
      throw new HttpError(
        400,
        "MIGRATION_LIMIT_EXCEEDED",
        `${name} contains more than 25,000 records.`,
      );
    }
  }

  return { snapshot, appData, preferences, collections };
}

async function resolveLegacyReference(
  client: PoolClient,
  groupCode: string,
  value: unknown,
): Promise<string | null> {
  const candidate = text(value);
  if (!candidate) return null;
  const result = await client.query<{ code: string }>(
    `
      SELECT code
      FROM reference_values
      WHERE group_code = $1
        AND (
          UPPER(code) = UPPER($2)
          OR LOWER(label) = LOWER($2)
          OR EXISTS (
            SELECT 1
            FROM JSONB_ARRAY_ELEMENTS_TEXT(
              CASE
                WHEN JSONB_TYPEOF(metadata -> 'aliases') = 'array'
                  THEN metadata -> 'aliases'
                ELSE '[]'::JSONB
              END
            ) AS alias(value)
            WHERE LOWER(alias.value) = LOWER($2)
          )
        )
      ORDER BY is_active DESC
      LIMIT 1
    `,
    [groupCode, candidate],
  );
  return result.rows[0]?.code || null;
}

async function previewCollections(
  pool: Pool,
  collections: Record<CollectionName, Record<string, any>[]>,
) {
  const incoming: Record<string, number> = {};
  const existing: Record<string, number> = {};
  const conflicts: Record<string, number> = {};

  for (const name of Object.keys(COLLECTION_TABLES) as CollectionName[]) {
    const table = COLLECTION_TABLES[name];
    const records = collections[name];
    const ids = records.map((record) => text(record.id)).filter(Boolean);
    incoming[name] = records.length;
    const current = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM ${table}`,
    );
    existing[name] = Number(current.rows[0].count);
    if (ids.length) {
      const matching = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count FROM ${table} WHERE id = ANY($1::TEXT[])`,
        [ids],
      );
      conflicts[name] = Number(matching.rows[0].count);
    } else {
      conflicts[name] = 0;
    }
  }

  return { incoming, existing, conflicts };
}

async function importExperts(
  client: PoolClient,
  records: Record<string, any>[],
) {
  for (const expert of records) {
    const id = recordId(expert, "expert");
    const name =
      text(expert.fullName || expert.name) || `Unnamed Expert ${id}`;
    await client.query(
      `
        INSERT INTO experts
          (id, name, primary_position, expert_type_code, education_level_code, data)
        VALUES ($1, $2, $3, $4, $5, $6::JSONB)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          primary_position = EXCLUDED.primary_position,
          expert_type_code = EXCLUDED.expert_type_code,
          education_level_code = EXCLUDED.education_level_code,
          data = EXCLUDED.data
      `,
      [
        id,
        name,
        text(expert.primary_position || expert.primaryPosition),
        await resolveLegacyReference(client, "expert_type", expert.type),
        await resolveLegacyReference(
          client,
          "education_level",
          expert.educationLevel,
        ),
        JSON.stringify({ ...expert, id }),
      ],
    );
  }
}

async function importTenders(
  client: PoolClient,
  records: Record<string, any>[],
) {
  for (const tender of records) {
    const id = recordId(tender, "tender");
    const name =
      text(tender.tender_title || tender.name) || `Unnamed Tender ${id}`;
    await client.query(
      `
        INSERT INTO tenders
          (id, internal_code, name, client, deadline, status_code, tender_format_code, data)
        VALUES ($1, $2, $3, $4, $5::TIMESTAMPTZ, $6, $7, $8::JSONB)
        ON CONFLICT (id) DO UPDATE SET
          internal_code = EXCLUDED.internal_code,
          name = EXCLUDED.name,
          client = EXCLUDED.client,
          deadline = EXCLUDED.deadline,
          status_code = EXCLUDED.status_code,
          tender_format_code = EXCLUDED.tender_format_code,
          data = EXCLUDED.data
      `,
      [
        id,
        text(tender.internal_code),
        name,
        text(tender.client),
        timestamp(tender.deadline),
        await resolveLegacyReference(
          client,
          "tender_status",
          tender.status || "OPEN",
        ),
        await resolveLegacyReference(
          client,
          "tender_format",
          tender.tender_format,
        ),
        JSON.stringify({ ...tender, id }),
      ],
    );
  }
}

async function importMatches(
  client: PoolClient,
  records: Record<string, any>[],
) {
  for (const match of records) {
    const id = recordId(match, "match");
    await client.query(
      `
        INSERT INTO matches
          (id, tender_id, expert_id, tender_position_id, role_name,
           score, risk_level_code, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB)
        ON CONFLICT (id) DO UPDATE SET
          tender_id = EXCLUDED.tender_id,
          expert_id = EXCLUDED.expert_id,
          tender_position_id = EXCLUDED.tender_position_id,
          role_name = EXCLUDED.role_name,
          score = EXCLUDED.score,
          risk_level_code = EXCLUDED.risk_level_code,
          data = EXCLUDED.data
      `,
      [
        id,
        text(match.tenderId || match.tender_id),
        text(match.expertId || match.expert_id || match.expert?.id),
        text(match.positionId || match.tender_position_id),
        text(match.positionTitle || match.role_name),
        Number.isFinite(Number(match.score)) ? Number(match.score) : null,
        await resolveLegacyReference(
          client,
          "risk_level",
          match.risk_level || match.riskLevel,
        ),
        JSON.stringify({ ...match, id }),
      ],
    );
  }
}

async function importCvs(
  client: PoolClient,
  records: Record<string, any>[],
) {
  for (const cv of records) {
    const id = recordId(cv, "cv");
    await client.query(
      `
        INSERT INTO generated_cvs
          (id, expert_id, tender_id, match_id, generation_mode_code,
           language_code, filename, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB)
        ON CONFLICT (id) DO UPDATE SET
          expert_id = EXCLUDED.expert_id,
          tender_id = EXCLUDED.tender_id,
          match_id = EXCLUDED.match_id,
          generation_mode_code = EXCLUDED.generation_mode_code,
          language_code = EXCLUDED.language_code,
          filename = EXCLUDED.filename,
          data = EXCLUDED.data
      `,
      [
        id,
        text(cv.expertId || cv.expert_id),
        text(cv.tenderId || cv.tender_id),
        text(cv.matchId || cv.match_id),
        await resolveLegacyReference(
          client,
          "cv_generation_mode",
          cv.mode || cv.generationMode || cv.type,
        ),
        await resolveLegacyReference(
          client,
          "translation_language",
          cv.language,
        ),
        text(cv.filename),
        JSON.stringify({ ...cv, id }),
      ],
    );
  }
}

async function importBrandings(
  client: PoolClient,
  records: Record<string, any>[],
) {
  for (const branding of records) {
    const id = recordId(branding, "branding");
    const name = text(branding.name) || `Unnamed Branding ${id}`;
    await client.query(
      `
        INSERT INTO brandings (id, name, data)
        VALUES ($1, $2, $3::JSONB)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          data = EXCLUDED.data
      `,
      [id, name, JSON.stringify({ ...branding, id })],
    );
  }
}

async function importUsers(
  client: PoolClient,
  records: Record<string, any>[],
) {
  for (const user of records) {
    let id = recordId(user, "user");
    const email = text(user.email)?.toLowerCase() || `${id}@legacy.invalid`;
    const existingEmail = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email],
    );
    if (existingEmail.rowCount) id = existingEmail.rows[0].id;
    await client.query(
      `
        INSERT INTO users (id, name, email, role_code, status_code, data)
        VALUES ($1, $2, $3, $4, $5, $6::JSONB)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          role_code = EXCLUDED.role_code,
          status_code = EXCLUDED.status_code,
          data = EXCLUDED.data
      `,
      [
        id,
        text(user.name) || `Unnamed User ${id}`,
        email,
        await resolveLegacyReference(client, "user_role", user.role),
        await resolveLegacyReference(client, "user_status", user.status),
        JSON.stringify({ ...user, id }),
      ],
    );
  }
}

async function importLogs(
  client: PoolClient,
  records: Record<string, any>[],
) {
  for (const log of records) {
    const id = recordId(log, "log");
    await client.query(
      `
        INSERT INTO activity_logs (id, action, detail, status_code, data)
        VALUES ($1, $2, $3, $4, $5::JSONB)
        ON CONFLICT (id) DO UPDATE SET
          action = EXCLUDED.action,
          detail = EXCLUDED.detail,
          status_code = EXCLUDED.status_code,
          data = EXCLUDED.data
      `,
      [
        id,
        text(log.action) || "Legacy Activity",
        text(log.detail),
        text(log.status),
        JSON.stringify({ ...log, id }),
      ],
    );
  }
}

async function importSettingsAndPreferences(
  client: PoolClient,
  appData: Record<string, any>,
  preferences: Record<string, any>,
) {
  const settings = [
    ["google-drive", appData.googleDrive],
    ["ai-settings", appData.aiSettings],
  ] as const;
  for (const [key, value] of settings) {
    if (value === undefined) continue;
    await client.query(
      `
        INSERT INTO app_settings (key, value, is_secret)
        VALUES ($1, $2::JSONB, FALSE)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `,
      [key, JSON.stringify(value)],
    );
  }

  for (const [key, value] of Object.entries(preferences)) {
    if (value === undefined || value === null) continue;
    if (key === "pendingTender" || key === "pendingExpert") {
      await client.query(
        `
          INSERT INTO ingestion_drafts (id, user_id, draft_type, payload)
          VALUES ($1, 'legacy-browser-user', $2, $3::JSONB)
          ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
        `,
        [`legacy-${key}`, key, JSON.stringify(value)],
      );
      continue;
    }
    await client.query(
      `
        INSERT INTO user_preferences (user_id, key, value)
        VALUES ('legacy-browser-user', $1, $2::JSONB)
        ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
      `,
      [key, JSON.stringify(value)],
    );
  }

  if (Array.isArray(appData.taxonomy)) {
    for (let index = 0; index < appData.taxonomy.length; index++) {
      const label = text(appData.taxonomy[index]);
      if (!label) continue;
      const existing = await client.query(
        `SELECT 1 FROM position_taxonomy WHERE LOWER(label) = LOWER($1)`,
        [label],
      );
      if (existing.rowCount) continue;
      const code = `LEGACY_${label
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")}_${index}`;
      await client.query(
        `
          INSERT INTO position_taxonomy
            (code, label, category_code, category_label, sort_order)
          VALUES ($1, $2, 'LEGACY_CUSTOM', 'Legacy Custom', $3)
          ON CONFLICT (code) DO NOTHING
        `,
        [code, label, index],
      );
    }
  }
}

export function createMigrationRouter(pool: Pool) {
  const router = express.Router();

  router.post(
    "/browser-data/preview",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const parsed = snapshotFromBody(req.body);
      const preview = await previewCollections(pool, parsed.collections);
      res.json({
        valid: true,
        capturedAt: parsed.snapshot.capturedAt || null,
        ...preview,
        browserDataWillBeCleared: false,
      });
    }),
  );

  router.post(
    "/browser-data/import",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const parsed = snapshotFromBody(req.body);
      const preview = await previewCollections(pool, parsed.collections);
      await withTransaction(pool, async (client) => {
        await importExperts(client, parsed.collections.experts);
        await importTenders(client, parsed.collections.tenders);
        await importMatches(client, parsed.collections.matches);
        await importCvs(client, parsed.collections.cvs);
        await importBrandings(client, parsed.collections.brandings);
        await importUsers(client, parsed.collections.users);
        await importLogs(client, parsed.collections.logs);
        await importSettingsAndPreferences(
          client,
          parsed.appData,
          parsed.preferences,
        );
      });

      const after = await previewCollections(pool, parsed.collections);
      res.json({
        success: true,
        imported: preview.incoming,
        conflictsUpdated: preview.conflicts,
        databaseCounts: after.existing,
        browserDataCleared: false,
      });
    }),
  );

  return router;
}
