import express from "express";
import type { Pool, PoolClient } from "pg";
import { v4 as uuidv4 } from "uuid";
import {
  apiErrorHandler,
  asyncRoute,
  boundedInteger,
  HttpError,
  optionalString,
  requireObject,
  requireString,
  requireWriteAccess,
  withTransaction,
} from "./http.ts";
import { createMigrationRouter } from "./migrationRouter.ts";

type Queryable = Pick<Pool, "query"> | PoolClient;

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function json(value: unknown): string {
  return JSON.stringify(asObject(value));
}

function recordData(
  row: Record<string, any>,
  overrides: Record<string, any> = {},
): Record<string, any> {
  return {
    ...asObject(row.data),
    id: row.id,
    ...overrides,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function expertFromRow(row: Record<string, any>): Record<string, any> {
  return recordData(row, {
    name: row.name,
    fullName: asObject(row.data).fullName || row.name,
    primary_position:
      row.primary_position ?? asObject(row.data).primary_position ?? null,
    type: asObject(row.data).type ?? row.expert_type_code ?? null,
    educationLevel:
      asObject(row.data).educationLevel ?? row.education_level_code ?? null,
  });
}

function tenderFromRow(row: Record<string, any>): Record<string, any> {
  const data = asObject(row.data);
  return recordData(row, {
    internal_code: row.internal_code ?? data.internal_code ?? null,
    name: row.name,
    tender_title: data.tender_title || row.name,
    client: row.client ?? data.client ?? null,
    deadline: row.deadline ?? data.deadline ?? null,
    status: data.status ?? row.status_code ?? null,
    tender_format: data.tender_format ?? row.tender_format_code ?? null,
  });
}

function matchFromRow(row: Record<string, any>): Record<string, any> {
  const data = asObject(row.data);
  return recordData(row, {
    tenderId: data.tenderId ?? row.tender_id ?? null,
    expertId: data.expertId ?? row.expert_id ?? null,
    positionId: data.positionId ?? row.tender_position_id ?? null,
    positionTitle: data.positionTitle ?? row.role_name ?? null,
    score: data.score ?? (row.score === null ? null : Number(row.score)),
    risk_level: data.risk_level ?? row.risk_level_code ?? null,
  });
}

function cvFromRow(row: Record<string, any>): Record<string, any> {
  const data = asObject(row.data);
  return recordData(row, {
    expertId: data.expertId ?? row.expert_id ?? null,
    tenderId: data.tenderId ?? row.tender_id ?? null,
    matchId: data.matchId ?? row.match_id ?? null,
    mode: data.mode ?? row.generation_mode_code ?? null,
    language: data.language ?? row.language_code ?? null,
    filename: data.filename ?? row.filename ?? null,
  });
}

function brandingFromRow(row: Record<string, any>): Record<string, any> {
  return recordData(row, { name: row.name });
}

function userFromRow(row: Record<string, any>): Record<string, any> {
  const data = asObject(row.data);
  return recordData(row, {
    name: row.name,
    email: row.email,
    role: data.role ?? row.role_code ?? null,
    status: data.status ?? row.status_code ?? null,
  });
}

async function resolveReferenceCode(
  database: Queryable,
  groupCode: string,
  value: unknown,
): Promise<string | null> {
  const candidate = optionalString(value);
  if (!candidate) return null;
  const result = await database.query<{ code: string }>(
    `
      SELECT code
      FROM reference_values
      WHERE group_code = $1
        AND is_active
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
      LIMIT 1
    `,
    [groupCode, candidate],
  );
  if (!result.rowCount) {
    throw new HttpError(
      400,
      "INVALID_REFERENCE_VALUE",
      `"${candidate}" is not an active ${groupCode} value.`,
    );
  }
  return result.rows[0].code;
}

async function addActivityLog(
  database: Queryable,
  action: string,
  detail: string,
  statusCode = "SUCCESS",
) {
  await database.query(
    `
      INSERT INTO activity_logs (id, action, detail, status_code, data)
      VALUES ($1, $2, $3, $4, $5::JSONB)
    `,
    [
      uuidv4(),
      action,
      detail,
      statusCode,
      JSON.stringify({
        action,
        detail,
        status: statusCode,
        timestamp: new Date().toISOString(),
      }),
    ],
  );
}

function normalizeReferenceCode(value: string): string {
  const code = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (!code || code.length > 100) {
    throw new HttpError(400, "INVALID_REFERENCE_CODE", "Invalid reference code.");
  }
  return code;
}

export function createPostgresApiRouter(pool: Pool) {
  const router = express.Router();

  router.use("/migration", createMigrationRouter(pool));

  router.get(
    "/health",
    asyncRoute(async (_req, res) => {
      const result = await pool.query<{
        database_name: string;
        postgres_version: string;
        migrations: string;
      }>(`
        SELECT
          current_database() AS database_name,
          current_setting('server_version') AS postgres_version,
          (SELECT COUNT(*) FROM schema_migrations)::TEXT AS migrations
      `);
      res.json({
        ok: true,
        database: result.rows[0].database_name,
        postgresVersion: result.rows[0].postgres_version,
        appliedMigrations: Number(result.rows[0].migrations),
      });
    }),
  );

  router.get(
    "/bootstrap",
    asyncRoute(async (_req, res) => {
      const [groups, values, taxonomy] = await Promise.all([
        pool.query(
          `SELECT code, name, description, is_system
           FROM reference_groups ORDER BY name`,
        ),
        pool.query(
          `SELECT group_code, code, label, description, sort_order, metadata
           FROM reference_values
           WHERE is_active
           ORDER BY group_code, sort_order, label`,
        ),
        pool.query(
          `SELECT code, label, category_code, category_label, sort_order, metadata
           FROM position_taxonomy
           WHERE is_active
           ORDER BY category_label, sort_order, label`,
        ),
      ]);

      const byGroup: Record<string, any[]> = {};
      for (const group of groups.rows) byGroup[group.code] = [];
      for (const value of values.rows) {
        (byGroup[value.group_code] ||= []).push({
          code: value.code,
          label: value.label,
          description: value.description,
          sortOrder: value.sort_order,
          metadata: value.metadata,
        });
      }

      res.json({
        referenceData: byGroup,
        referenceGroups: groups.rows,
        positionTaxonomy: taxonomy.rows,
      });
    }),
  );

  router.get(
    "/reference-data",
    asyncRoute(async (req, res) => {
      const includeInactive = req.query.includeInactive === "true";
      const result = await pool.query(
        `
          SELECT
            g.code AS group_code,
            g.name AS group_name,
            g.description AS group_description,
            g.is_system,
            COALESCE(
              JSONB_AGG(
                JSONB_BUILD_OBJECT(
                  'code', v.code,
                  'label', v.label,
                  'description', v.description,
                  'sortOrder', v.sort_order,
                  'isActive', v.is_active,
                  'metadata', v.metadata
                )
                ORDER BY v.sort_order, v.label
              ) FILTER (WHERE v.id IS NOT NULL),
              '[]'::JSONB
            ) AS values
          FROM reference_groups g
          LEFT JOIN reference_values v
            ON v.group_code = g.code
           AND ($1::BOOLEAN OR v.is_active)
          GROUP BY g.code, g.name, g.description, g.is_system
          ORDER BY g.name
        `,
        [includeInactive],
      );
      res.json(result.rows);
    }),
  );

  router.get(
    "/reference-data/:groupCode",
    asyncRoute(async (req, res) => {
      const includeInactive = req.query.includeInactive === "true";
      const group = await pool.query(
        `SELECT code, name, description, is_system
         FROM reference_groups WHERE code = $1`,
        [req.params.groupCode],
      );
      if (!group.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Reference group not found.");
      }
      const values = await pool.query(
        `
          SELECT code, label, description, sort_order, is_active, metadata
          FROM reference_values
          WHERE group_code = $1 AND ($2::BOOLEAN OR is_active)
          ORDER BY sort_order, label
        `,
        [req.params.groupCode, includeInactive],
      );
      res.json({ ...group.rows[0], values: values.rows });
    }),
  );

  router.post(
    "/reference-data/:groupCode/values",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const body = requireObject(req.body);
      const groupCode = req.params.groupCode;
      const code = normalizeReferenceCode(
        optionalString(body.code) || requireString(body.label, "label", 200),
      );
      const label = requireString(body.label, "label", 200);
      const result = await pool.query(
        `
          INSERT INTO reference_values
            (group_code, code, label, description, sort_order, is_active, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB)
          RETURNING code, label, description, sort_order, is_active, metadata
        `,
        [
          groupCode,
          code,
          label,
          optionalString(body.description),
          boundedInteger(body.sortOrder, 0, -1_000_000, 1_000_000),
          body.isActive !== false,
          json(body.metadata),
        ],
      );
      res.status(201).json(result.rows[0]);
    }),
  );

  router.patch(
    "/reference-data/:groupCode/values/:code",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const body = requireObject(req.body);
      const result = await pool.query(
        `
          UPDATE reference_values
          SET
            label = COALESCE($3, label),
            description = CASE WHEN $4::BOOLEAN THEN $5 ELSE description END,
            sort_order = COALESCE($6, sort_order),
            is_active = COALESCE($7, is_active),
            metadata = CASE WHEN $8::BOOLEAN THEN $9::JSONB ELSE metadata END
          WHERE group_code = $1 AND code = $2
          RETURNING code, label, description, sort_order, is_active, metadata
        `,
        [
          req.params.groupCode,
          req.params.code,
          optionalString(body.label),
          Object.hasOwn(body, "description"),
          optionalString(body.description),
          body.sortOrder === undefined
            ? null
            : boundedInteger(body.sortOrder, 0, -1_000_000, 1_000_000),
          typeof body.isActive === "boolean" ? body.isActive : null,
          Object.hasOwn(body, "metadata"),
          json(body.metadata),
        ],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Reference value not found.");
      }
      res.json(result.rows[0]);
    }),
  );

  router.delete(
    "/reference-data/:groupCode/values/:code",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `
          UPDATE reference_values SET is_active = FALSE
          WHERE group_code = $1 AND code = $2
          RETURNING code
        `,
        [req.params.groupCode, req.params.code],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Reference value not found.");
      }
      res.json({ success: true });
    }),
  );

  router.get(
    "/taxonomy",
    asyncRoute(async (req, res) => {
      const includeInactive = req.query.includeInactive === "true";
      const result = await pool.query(
        `
          SELECT code, label, category_code, category_label, sort_order, is_active, metadata
          FROM position_taxonomy
          WHERE $1::BOOLEAN OR is_active
          ORDER BY category_label, sort_order, label
        `,
        [includeInactive],
      );
      res.json(result.rows);
    }),
  );

  router.post(
    "/taxonomy",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const body = requireObject(req.body);
      const label = requireString(body.label, "label", 200);
      const categoryLabel = requireString(
        body.categoryLabel,
        "categoryLabel",
        200,
      );
      const result = await pool.query(
        `
          INSERT INTO position_taxonomy
            (code, label, category_code, category_label, sort_order, metadata)
          VALUES ($1, $2, $3, $4, $5, $6::JSONB)
          RETURNING code, label, category_code, category_label, sort_order, is_active, metadata
        `,
        [
          normalizeReferenceCode(optionalString(body.code) || label),
          label,
          normalizeReferenceCode(
            optionalString(body.categoryCode) || categoryLabel,
          ),
          categoryLabel,
          boundedInteger(body.sortOrder, 0, -1_000_000, 1_000_000),
          json(body.metadata),
        ],
      );
      res.status(201).json(result.rows[0]);
    }),
  );

  router.patch(
    "/taxonomy/:code",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const body = requireObject(req.body);
      const result = await pool.query(
        `
          UPDATE position_taxonomy SET
            label = COALESCE($2, label),
            category_code = COALESCE($3, category_code),
            category_label = COALESCE($4, category_label),
            sort_order = COALESCE($5, sort_order),
            is_active = COALESCE($6, is_active),
            metadata = CASE WHEN $7::BOOLEAN THEN $8::JSONB ELSE metadata END
          WHERE code = $1
          RETURNING code, label, category_code, category_label, sort_order, is_active, metadata
        `,
        [
          req.params.code,
          optionalString(body.label),
          body.categoryCode
            ? normalizeReferenceCode(String(body.categoryCode))
            : null,
          optionalString(body.categoryLabel),
          body.sortOrder === undefined
            ? null
            : boundedInteger(body.sortOrder, 0, -1_000_000, 1_000_000),
          typeof body.isActive === "boolean" ? body.isActive : null,
          Object.hasOwn(body, "metadata"),
          json(body.metadata),
        ],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Taxonomy position not found.");
      }
      res.json(result.rows[0]);
    }),
  );

  router.delete(
    "/taxonomy/:code",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `UPDATE position_taxonomy SET is_active = FALSE
         WHERE code = $1 RETURNING code`,
        [req.params.code],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Taxonomy position not found.");
      }
      res.json({ success: true });
    }),
  );

  router.get(
    "/stats",
    asyncRoute(async (_req, res) => {
      const result = await pool.query<{
        total_experts: string;
        active_tenders: string;
        cvs_generated: string;
        total_matches: string;
        match_rate: string | null;
      }>(`
        SELECT
          (SELECT COUNT(*) FROM experts)::TEXT AS total_experts,
          (SELECT COUNT(*) FROM tenders)::TEXT AS active_tenders,
          (SELECT COUNT(*) FROM generated_cvs)::TEXT AS cvs_generated,
          (SELECT COUNT(*) FROM matches)::TEXT AS total_matches,
          (SELECT ROUND(AVG(score)) FROM matches)::TEXT AS match_rate
      `);
      const row = result.rows[0];
      res.json({
        totalExperts: Number(row.total_experts),
        activeTenders: Number(row.active_tenders),
        cvsGenerated: Number(row.cvs_generated),
        totalMatches: Number(row.total_matches),
        matchRate: Number(row.match_rate || 0),
      });
    }),
  );

  router.get(
    "/experts",
    asyncRoute(async (req, res) => {
      const limit = boundedInteger(req.query.limit, 5000, 1, 10_000);
      const offset = boundedInteger(req.query.offset, 0, 0, 10_000_000);
      const result = await pool.query(
        `SELECT * FROM experts ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      res.json(result.rows.map(expertFromRow));
    }),
  );

  router.get(
    "/experts/:id",
    asyncRoute(async (req, res) => {
      const result = await pool.query(`SELECT * FROM experts WHERE id = $1`, [
        req.params.id,
      ]);
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Expert not found.");
      }
      res.json(expertFromRow(result.rows[0]));
    }),
  );

  router.post(
    "/experts/bulk",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const body = requireObject(req.body);
      if (!Array.isArray(body.experts) || body.experts.length === 0) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          "experts must be a non-empty array.",
        );
      }
      if (body.experts.length > 1000) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          "A maximum of 1000 experts can be saved per request.",
        );
      }

      const counts = await withTransaction(pool, async (client) => {
        let added = 0;
        let updated = 0;
        for (const input of body.experts) {
          const expert = requireObject(input, "expert");
          const name = requireString(
            expert.fullName || expert.name,
            "expert.fullName",
            500,
          );
          let id = optionalString(expert.id);
          if (!id) {
            const existing = await client.query<{ id: string }>(
              `SELECT id FROM experts WHERE LOWER(name) = LOWER($1)
               ORDER BY created_at LIMIT 1`,
              [name],
            );
            id = existing.rows[0]?.id || uuidv4();
          }
          const exists = await client.query(`SELECT 1 FROM experts WHERE id = $1`, [
            id,
          ]);
          const expertType = await resolveReferenceCode(
            client,
            "expert_type",
            expert.type,
          );
          const educationLevel = await resolveReferenceCode(
            client,
            "education_level",
            expert.educationLevel,
          );
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
                data = experts.data || EXCLUDED.data
            `,
            [
              id,
              name,
              optionalString(expert.primary_position || expert.primaryPosition),
              expertType,
              educationLevel,
              JSON.stringify(expert),
            ],
          );
          exists.rowCount ? updated++ : added++;
        }
        await addActivityLog(
          client,
          "Expert Ingestion",
          `Added ${added} and updated ${updated} expert profiles`,
        );
        return { added, updated };
      });
      res.json({ success: true, ...counts });
    }),
  );

  router.patch(
    "/experts/:id",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const updates = requireObject(req.body);
      const current = await pool.query(`SELECT * FROM experts WHERE id = $1`, [
        req.params.id,
      ]);
      if (!current.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Expert not found.");
      }
      const existing = expertFromRow(current.rows[0]);
      const merged: Record<string, any> = {
        ...existing,
        ...updates,
        id: req.params.id,
      };
      const name = requireString(
        merged.fullName || merged.name,
        "fullName",
        500,
      );
      const expertType = await resolveReferenceCode(
        pool,
        "expert_type",
        merged.type,
      );
      const educationLevel = await resolveReferenceCode(
        pool,
        "education_level",
        merged.educationLevel,
      );
      const result = await pool.query(
        `
          UPDATE experts SET
            name = $2,
            primary_position = $3,
            expert_type_code = $4,
            education_level_code = $5,
            data = data || $6::JSONB
          WHERE id = $1 RETURNING *
        `,
        [
          req.params.id,
          name,
          optionalString(merged.primary_position || merged.primaryPosition),
          expertType,
          educationLevel,
          JSON.stringify(updates),
        ],
      );
      await addActivityLog(
        pool,
        "Expert Updated",
        `Updated expert record for ${name}`,
      );
      res.json(expertFromRow(result.rows[0]));
    }),
  );

  router.delete(
    "/experts/:id",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `DELETE FROM experts WHERE id = $1 RETURNING id`,
        [req.params.id],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Expert not found.");
      }
      await addActivityLog(pool, "Expert Deleted", "Deleted expert record");
      res.json({ success: true });
    }),
  );

  router.get(
    "/tenders",
    asyncRoute(async (req, res) => {
      const limit = boundedInteger(req.query.limit, 5000, 1, 10_000);
      const offset = boundedInteger(req.query.offset, 0, 0, 10_000_000);
      const result = await pool.query(
        `SELECT * FROM tenders ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      res.json(result.rows.map(tenderFromRow));
    }),
  );

  router.get(
    "/tenders/:id",
    asyncRoute(async (req, res) => {
      const result = await pool.query(`SELECT * FROM tenders WHERE id = $1`, [
        req.params.id,
      ]);
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Tender not found.");
      }
      res.json(tenderFromRow(result.rows[0]));
    }),
  );

  router.post(
    "/tenders",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const input = requireObject(req.body);
      const id = optionalString(input.id) || uuidv4();
      const name = requireString(
        input.tender_title || input.name,
        "tender_title",
        1000,
      );
      const status = await resolveReferenceCode(
        pool,
        "tender_status",
        input.status || "OPEN",
      );
      const format = await resolveReferenceCode(
        pool,
        "tender_format",
        input.tender_format,
      );
      const positions = Array.isArray(input.positions)
        ? input.positions.map((position: any, index: number) => ({
            ...position,
            id: position?.id || `pos_${Date.now()}_${index}`,
          }))
        : [];
      const data = { ...input, id, status: input.status || "OPEN", positions };
      const result = await pool.query(
        `
          INSERT INTO tenders
            (id, internal_code, name, client, deadline, status_code, tender_format_code, data)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB)
          RETURNING *
        `,
        [
          id,
          optionalString(input.internal_code),
          name,
          optionalString(input.client),
          optionalString(input.deadline),
          status,
          format,
          JSON.stringify(data),
        ],
      );
      await addActivityLog(
        pool,
        "Tender Integration",
        `Opportunity "${name}" added to pipeline`,
      );
      res.status(201).json(tenderFromRow(result.rows[0]));
    }),
  );

  router.patch(
    "/tenders/:id",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const updates = requireObject(req.body);
      const current = await pool.query(`SELECT * FROM tenders WHERE id = $1`, [
        req.params.id,
      ]);
      if (!current.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Tender not found.");
      }
      const merged = { ...tenderFromRow(current.rows[0]), ...updates };
      const name = requireString(
        merged.tender_title || merged.name,
        "tender_title",
        1000,
      );
      const status = await resolveReferenceCode(
        pool,
        "tender_status",
        merged.status,
      );
      const format = await resolveReferenceCode(
        pool,
        "tender_format",
        merged.tender_format,
      );
      const result = await pool.query(
        `
          UPDATE tenders SET
            internal_code = $2,
            name = $3,
            client = $4,
            deadline = $5,
            status_code = $6,
            tender_format_code = $7,
            data = data || $8::JSONB
          WHERE id = $1 RETURNING *
        `,
        [
          req.params.id,
          optionalString(merged.internal_code),
          name,
          optionalString(merged.client),
          optionalString(merged.deadline),
          status,
          format,
          JSON.stringify(updates),
        ],
      );
      await addActivityLog(
        pool,
        "Tender Updated",
        `Details updated for "${name}"`,
      );
      res.json(tenderFromRow(result.rows[0]));
    }),
  );

  router.delete(
    "/tenders/:id",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const deleted = await withTransaction(pool, async (client) => {
        await client.query(`DELETE FROM matches WHERE tender_id = $1`, [
          req.params.id,
        ]);
        const result = await client.query(
          `DELETE FROM tenders WHERE id = $1 RETURNING id`,
          [req.params.id],
        );
        if (!result.rowCount) {
          throw new HttpError(404, "NOT_FOUND", "Tender not found.");
        }
        await addActivityLog(client, "Tender Deleted", "Deleted tender record");
        return true;
      });
      res.json({ success: deleted });
    }),
  );

  router.get(
    "/tenders/:id/documents",
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `SELECT * FROM tender_documents
         WHERE tender_id = $1 ORDER BY created_at`,
        [req.params.id],
      );
      res.json(result.rows);
    }),
  );

  router.post(
    "/tenders/:id/documents",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const body = requireObject(req.body);
      const result = await pool.query(
        `
          INSERT INTO tender_documents
            (id, tender_id, document_type_code, original_name, mime_type,
             storage_provider, storage_key, size_bytes, checksum_sha256, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB)
          RETURNING *
        `,
        [
          optionalString(body.id) || uuidv4(),
          req.params.id,
          optionalString(body.documentTypeCode),
          requireString(body.originalName, "originalName", 1000),
          optionalString(body.mimeType),
          optionalString(body.storageProvider),
          optionalString(body.storageKey),
          body.sizeBytes ?? null,
          optionalString(body.checksumSha256),
          json(body.metadata),
        ],
      );
      res.status(201).json(result.rows[0]);
    }),
  );

  router.delete(
    "/tenders/:tenderId/documents/:documentId",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `DELETE FROM tender_documents
         WHERE id = $1 AND tender_id = $2 RETURNING id`,
        [req.params.documentId, req.params.tenderId],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Tender document not found.");
      }
      res.json({ success: true });
    }),
  );

  router.get(
    "/matches",
    asyncRoute(async (req, res) => {
      const tenderId = optionalString(req.query.tenderId);
      const result = await pool.query(
        `
          SELECT * FROM matches
          WHERE ($1::TEXT IS NULL OR tender_id = $1)
          ORDER BY created_at DESC
        `,
        [tenderId],
      );
      res.json(result.rows.map(matchFromRow));
    }),
  );

  router.post(
    "/matches/bulk",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const body = requireObject(req.body);
      const tenderId = requireString(body.tenderId, "tenderId", 500);
      const positionId = requireString(body.positionId, "positionId", 500);
      const positionTitle = requireString(
        body.positionTitle,
        "positionTitle",
        1000,
      );
      if (!Array.isArray(body.matches)) {
        throw new HttpError(400, "INVALID_REQUEST", "matches must be an array.");
      }
      if (body.matches.length > 5000) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          "A maximum of 5000 matches can be saved per request.",
        );
      }

      await withTransaction(pool, async (client) => {
        const incomingExpertIds = body.matches
          .map((match: any) => match?.expertId || match?.expert?.id)
          .filter(Boolean)
          .map(String);
        if (incomingExpertIds.length) {
          await client.query(
            `
              DELETE FROM matches
              WHERE tender_id = $1
                AND tender_position_id = $2
                AND expert_id = ANY($3::TEXT[])
            `,
            [tenderId, positionId, incomingExpertIds],
          );
        }
        for (const input of body.matches) {
          const match = requireObject(input, "match");
          const expertId = optionalString(match.expertId || match.expert?.id);
          const riskLevel = await resolveReferenceCode(
            client,
            "risk_level",
            match.risk_level || match.riskLevel,
          );
          const data = {
            ...match,
            tenderId,
            positionId,
            positionTitle,
            expertId,
          };
          await client.query(
            `
              INSERT INTO matches
                (id, tender_id, expert_id, tender_position_id, role_name,
                 score, risk_level_code, data)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB)
            `,
            [
              optionalString(match.id) || `match_${uuidv4()}`,
              tenderId,
              expertId,
              positionId,
              positionTitle,
              match.score ?? null,
              riskLevel,
              JSON.stringify(data),
            ],
          );
        }
        const matchedAt = new Date().toISOString();
        await client.query(
          `
            UPDATE tenders
            SET data = data || JSONB_BUILD_OBJECT('last_matched_at', $2::TEXT)
            WHERE id = $1
          `,
          [tenderId, matchedAt],
        );
        await addActivityLog(
          client,
          "Match Execution",
          `Ran AI matching engine for position ${positionTitle}`,
        );
      });
      res.json({ success: true });
    }),
  );

  router.patch(
    "/matches/:id",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const updates = requireObject(req.body);
      const result = await pool.query(
        `
          UPDATE matches SET
            score = COALESCE($2, score),
            risk_level_code = COALESCE($3, risk_level_code),
            data = data || $4::JSONB
          WHERE id = $1 RETURNING *
        `,
        [
          req.params.id,
          updates.score ?? null,
          updates.risk_level || updates.riskLevel
            ? await resolveReferenceCode(
                pool,
                "risk_level",
                updates.risk_level || updates.riskLevel,
              )
            : null,
          JSON.stringify(updates),
        ],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Match not found.");
      }
      res.json(matchFromRow(result.rows[0]));
    }),
  );

  router.delete(
    "/matches/:id",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `DELETE FROM matches WHERE id = $1 RETURNING id`,
        [req.params.id],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Match not found.");
      }
      res.json({ success: true });
    }),
  );

  router.get(
    "/generated-cvs",
    asyncRoute(async (_req, res) => {
      const result = await pool.query(
        `SELECT * FROM generated_cvs ORDER BY created_at DESC`,
      );
      res.json(result.rows.map(cvFromRow));
    }),
  );

  router.post(
    "/generated-cvs",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const cv = requireObject(req.body);
      const id = optionalString(cv.id) || `cv_${uuidv4()}`;
      const mode = await resolveReferenceCode(
        pool,
        "cv_generation_mode",
        cv.mode || cv.generationMode,
      );
      const language = await resolveReferenceCode(
        pool,
        "translation_language",
        cv.language,
      );
      const result = await pool.query(
        `
          INSERT INTO generated_cvs
            (id, expert_id, tender_id, match_id, generation_mode_code,
             language_code, filename, data)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB)
          RETURNING *
        `,
        [
          id,
          optionalString(cv.expertId),
          optionalString(cv.tenderId),
          optionalString(cv.matchId),
          mode,
          language,
          optionalString(cv.filename),
          JSON.stringify(cv),
        ],
      );
      await addActivityLog(
        pool,
        "CV Generation",
        `Branded CV generated for ${cv.expertName || "Expert"}`,
      );
      res.status(201).json(cvFromRow(result.rows[0]));
    }),
  );

  router.patch(
    "/generated-cvs/:id",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const updates = requireObject(req.body);
      const result = await pool.query(
        `UPDATE generated_cvs SET data = data || $2::JSONB
         WHERE id = $1 RETURNING *`,
        [req.params.id, JSON.stringify(updates)],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Generated CV not found.");
      }
      res.json(cvFromRow(result.rows[0]));
    }),
  );

  router.delete(
    "/generated-cvs/:id",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `DELETE FROM generated_cvs WHERE id = $1 RETURNING id`,
        [req.params.id],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Generated CV not found.");
      }
      await addActivityLog(pool, "CV Deleted", "Deleted generated CV");
      res.json({ success: true });
    }),
  );

  router.get(
    "/brandings",
    asyncRoute(async (_req, res) => {
      const result = await pool.query(
        `SELECT * FROM brandings ORDER BY created_at DESC`,
      );
      res.json(result.rows.map(brandingFromRow));
    }),
  );

  router.post(
    "/brandings",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const branding = requireObject(req.body);
      const name = requireString(branding.name, "name", 500);
      const result = await pool.query(
        `
          INSERT INTO brandings (id, name, data)
          VALUES ($1, $2, $3::JSONB) RETURNING *
        `,
        [optionalString(branding.id) || uuidv4(), name, JSON.stringify(branding)],
      );
      await addActivityLog(
        pool,
        "CREATE_BRANDING",
        `Created branding ${name}`,
      );
      res.status(201).json(brandingFromRow(result.rows[0]));
    }),
  );

  router.patch(
    "/brandings/:id",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const updates = requireObject(req.body);
      const result = await pool.query(
        `
          UPDATE brandings SET
            name = COALESCE($2, name),
            data = data || $3::JSONB
          WHERE id = $1 RETURNING *
        `,
        [
          req.params.id,
          optionalString(updates.name),
          JSON.stringify(updates),
        ],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Branding not found.");
      }
      res.json(brandingFromRow(result.rows[0]));
    }),
  );

  router.delete(
    "/brandings/:id",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `DELETE FROM brandings WHERE id = $1 RETURNING id`,
        [req.params.id],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Branding not found.");
      }
      await addActivityLog(
        pool,
        "DELETE_BRANDING",
        `Deleted branding ${req.params.id}`,
      );
      res.json({ success: true });
    }),
  );

  router.get(
    "/users",
    asyncRoute(async (_req, res) => {
      const result = await pool.query(
        `SELECT * FROM users ORDER BY created_at DESC`,
      );
      res.json(result.rows.map(userFromRow));
    }),
  );

  router.post(
    "/users",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const user = requireObject(req.body);
      const role = await resolveReferenceCode(
        pool,
        "user_role",
        user.role || "STAFF",
      );
      const status = await resolveReferenceCode(
        pool,
        "user_status",
        user.status || "INVITED",
      );
      const data = { ...user, role: user.role || "Staff", status: user.status || "Invited" };
      const result = await pool.query(
        `
          INSERT INTO users (id, name, email, role_code, status_code, data)
          VALUES ($1, $2, $3, $4, $5, $6::JSONB)
          RETURNING *
        `,
        [
          optionalString(user.id) || uuidv4(),
          requireString(user.name, "name", 500),
          requireString(user.email, "email", 500).toLowerCase(),
          role,
          status,
          JSON.stringify(data),
        ],
      );
      await addActivityLog(
        pool,
        "User Added",
        `Added user ${result.rows[0].email}`,
      );
      res.status(201).json(userFromRow(result.rows[0]));
    }),
  );

  router.patch(
    "/users/:id",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const updates = requireObject(req.body);
      const role = updates.role
        ? await resolveReferenceCode(pool, "user_role", updates.role)
        : null;
      const status = updates.status
        ? await resolveReferenceCode(pool, "user_status", updates.status)
        : null;
      const result = await pool.query(
        `
          UPDATE users SET
            name = COALESCE($2, name),
            email = COALESCE($3, email),
            role_code = COALESCE($4, role_code),
            status_code = COALESCE($5, status_code),
            data = data || $6::JSONB
          WHERE id = $1 RETURNING *
        `,
        [
          req.params.id,
          optionalString(updates.name),
          optionalString(updates.email)?.toLowerCase() || null,
          role,
          status,
          JSON.stringify(updates),
        ],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "User not found.");
      }
      res.json(userFromRow(result.rows[0]));
    }),
  );

  router.delete(
    "/users/:id",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `DELETE FROM users WHERE id = $1 RETURNING id`,
        [req.params.id],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "User not found.");
      }
      await addActivityLog(pool, "User Deleted", "Deleted user record");
      res.json({ success: true });
    }),
  );

  router.get(
    "/activity-logs",
    asyncRoute(async (req, res) => {
      const limit = boundedInteger(req.query.limit, 100, 1, 1000);
      const result = await pool.query(
        `SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      res.json(
        result.rows.map((row) =>
          recordData(row, {
            action: row.action,
            detail: row.detail,
            status: asObject(row.data).status || row.status_code,
            timestamp: asObject(row.data).timestamp || row.created_at,
          }),
        ),
      );
    }),
  );

  router.get(
    "/settings/:key",
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `SELECT key, value, is_secret, updated_at
         FROM app_settings WHERE key = $1`,
        [req.params.key],
      );
      if (!result.rowCount) {
        res.json({
          key: req.params.key,
          value: null,
          isSecret: false,
          exists: false,
          updatedAt: null,
        });
        return;
      }
      const setting = result.rows[0];
      res.json({
        key: setting.key,
        value: setting.is_secret ? { configured: true } : setting.value,
        isSecret: setting.is_secret,
        exists: true,
        updatedAt: setting.updated_at,
      });
    }),
  );

  router.put(
    "/settings/:key",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const body = requireObject(req.body);
      if (!Object.hasOwn(body, "value")) {
        throw new HttpError(400, "INVALID_REQUEST", "value is required.");
      }
      const result = await pool.query(
        `
          INSERT INTO app_settings (key, value, is_secret)
          VALUES ($1, $2::JSONB, $3)
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            is_secret = EXCLUDED.is_secret
          RETURNING key, is_secret, updated_at
        `,
        [req.params.key, JSON.stringify(body.value), body.isSecret === true],
      );
      res.json({
        success: true,
        key: result.rows[0].key,
        isSecret: result.rows[0].is_secret,
        updatedAt: result.rows[0].updated_at,
      });
    }),
  );

  router.get(
    "/preferences/:userId/:key",
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `SELECT value, updated_at FROM user_preferences
         WHERE user_id = $1 AND key = $2`,
        [req.params.userId, req.params.key],
      );
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Preference not found.");
      }
      res.json(result.rows[0]);
    }),
  );

  router.put(
    "/preferences/:userId/:key",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const body = requireObject(req.body);
      if (!Object.hasOwn(body, "value")) {
        throw new HttpError(400, "INVALID_REQUEST", "value is required.");
      }
      const result = await pool.query(
        `
          INSERT INTO user_preferences (user_id, key, value)
          VALUES ($1, $2, $3::JSONB)
          ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
          RETURNING value, updated_at
        `,
        [req.params.userId, req.params.key, JSON.stringify(body.value)],
      );
      res.json({ success: true, ...result.rows[0] });
    }),
  );

  router.post(
    "/jobs",
    requireWriteAccess,
    asyncRoute(async (req, res) => {
      const body = requireObject(req.body);
      const id = optionalString(body.id) || uuidv4();
      const result = await pool.query(
        `
          INSERT INTO jobs (id, job_type, status_code, payload)
          VALUES ($1, $2, 'PENDING', $3::JSONB)
          RETURNING *
        `,
        [id, requireString(body.type, "type", 200), json(body.payload)],
      );
      res.status(201).json(result.rows[0]);
    }),
  );

  router.get(
    "/jobs/:id",
    asyncRoute(async (req, res) => {
      const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [
        req.params.id,
      ]);
      if (!result.rowCount) {
        throw new HttpError(404, "NOT_FOUND", "Job not found.");
      }
      res.json(result.rows[0]);
    }),
  );

  router.use(apiErrorHandler);
  return router;
}
