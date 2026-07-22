import dotenv from "dotenv";
import express from "express";
import LZString from "lz-string";
import type { AddressInfo } from "node:net";
import { createPostgresApiRouter } from "../api/postgresRouter.ts";
import { createPostgresPool } from "./postgres.ts";

dotenv.config();
process.env.NODE_ENV = "test";
process.env.API_ADMIN_TOKEN = "integration-admin-token";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runApiIntegrationTest() {
  const pool = createPostgresPool();
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api/v2", createPostgresApiRouter(pool));

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/api/v2`;

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-admin-token": "integration-admin-token",
        ...(init?.headers || {}),
      },
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        `${init?.method || "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`,
      );
    }
    return body;
  }

  try {
    const health = await request("/health");
    assert(health.ok === true, "Health endpoint did not return ok.");

    const bootstrap = await request("/bootstrap");
    assert(
      bootstrap.referenceData.education_level.length >= 10,
      "Education-level reference data is missing.",
    );
    assert(
      bootstrap.positionTaxonomy.length === 23,
      "Position taxonomy count is incorrect.",
    );

    const legacyApplicationData = {
      experts: [
          {
            id: "legacy-expert-1",
            fullName: "Legacy Expert",
            type: "External",
            educationLevel: "Master's Degree",
          },
      ],
      tenders: [
          {
            id: "legacy-tender-1",
            tender_title: "Legacy Tender",
            status: "OPEN",
            tender_format: "PDF",
          },
      ],
      matches: [
          {
            id: "legacy-match-1",
            tenderId: "legacy-tender-1",
            expertId: "legacy-expert-1",
            score: 82,
            risk_level: "MEDIUM",
          },
      ],
      cvs: [
          {
            id: "legacy-cv-1",
            expertId: "legacy-expert-1",
            tenderId: "legacy-tender-1",
            mode: "NORMAL",
          },
      ],
      logs: [
          {
            id: "legacy-log-1",
            action: "Legacy Import Test",
            status: "SUCCESS",
          },
      ],
      users: [
          {
            id: "legacy-user-1",
            name: "Legacy User",
            email: "legacy@example.com",
            role: "Staff",
            status: "Active",
          },
      ],
      brandings: [
          {
            id: "legacy-branding-1",
            name: "Legacy Branding",
            header_base64: "data:image/png;base64,legacy",
          },
      ],
      taxonomy: ["Legacy Custom Position"],
      googleDrive: { folderId: "legacy-folder", processedIds: [] },
    };
    const migrationSnapshot = {
      format: "via-browser-data-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      decodedAppData: {
        experts: legacyApplicationData.experts,
        tenders: legacyApplicationData.tenders,
        matches: legacyApplicationData.matches,
        cvs: legacyApplicationData.cvs,
        logs: legacyApplicationData.logs,
        users: legacyApplicationData.users,
        brandings: legacyApplicationData.brandings,
      },
      rawStorage: {
        via_enterprise_v1: LZString.compressToUTF16(
          JSON.stringify(legacyApplicationData),
        ),
        profileSettings: JSON.stringify({
          fullName: "Legacy Administrator",
        }),
        hidden_modules_prefs: JSON.stringify(["matches"]),
        pendingTender: JSON.stringify({
          tender_title: "Pending Legacy Tender",
        }),
      },
    };

    const migrationPreview = await request("/migration/browser-data/preview", {
      method: "POST",
      body: JSON.stringify({ snapshot: migrationSnapshot }),
    });
    assert(
      migrationPreview.incoming.experts === 1 &&
        migrationPreview.conflicts.experts === 0 &&
        migrationPreview.browserDataWillBeCleared === false,
      "Migration preview returned incorrect counts.",
    );
    const migrationImport = await request("/migration/browser-data/import", {
      method: "POST",
      body: JSON.stringify({ snapshot: migrationSnapshot }),
    });
    assert(
      migrationImport.success === true &&
        migrationImport.browserDataCleared === false,
      "Browser migration import failed.",
    );
    const repeatPreview = await request("/migration/browser-data/preview", {
      method: "POST",
      body: JSON.stringify({ snapshot: migrationSnapshot }),
    });
    assert(
      repeatPreview.conflicts.experts === 1,
      "Repeat import conflicts were not detected.",
    );
    await request("/migration/browser-data/import", {
      method: "POST",
      body: JSON.stringify({ snapshot: migrationSnapshot }),
    });
    const migratedExpert = await request("/experts/legacy-expert-1");
    assert(
      migratedExpert.fullName === "Legacy Expert",
      "Migrated expert data was not preserved.",
    );
    const migratedGoogleDrive = await request("/settings/google-drive");
    assert(
      migratedGoogleDrive.value.folderId === "legacy-folder",
      "Settings embedded in the compressed legacy backup were not imported.",
    );
    const migratedTaxonomy = await request("/taxonomy");
    assert(
      migratedTaxonomy.some(
        (position: any) => position.label === "Legacy Custom Position",
      ),
      "Custom taxonomy embedded in the legacy backup was not imported.",
    );

    const expertSave = await request("/experts/bulk", {
      method: "POST",
      body: JSON.stringify({
        experts: [
          {
            id: "integration-expert-1",
            fullName: "Integration Expert",
            primary_position: "Project Manager",
            type: "External",
            educationLevel: "Bachelor's Degree",
          },
        ],
      }),
    });
    assert(expertSave.added === 1, "Expert was not created.");

    const expert = await request("/experts/integration-expert-1");
    assert(expert.fullName === "Integration Expert", "Expert mapping failed.");

    const tender = await request("/tenders", {
      method: "POST",
      body: JSON.stringify({
        id: "integration-tender-1",
        tender_title: "Integration Tender",
        client: "Integration Client",
        status: "OPEN",
        tender_format: "PDF",
        positions: [
          { id: "integration-position-1", position_title: "Project Manager" },
        ],
      }),
    });
    assert(tender.id === "integration-tender-1", "Tender was not created.");

    await request("/tenders/integration-tender-1/documents", {
      method: "POST",
      body: JSON.stringify({
        id: "integration-document-1",
        originalName: "terms-of-reference.pdf",
        mimeType: "application/pdf",
        storageProvider: "test",
        storageKey: "test/terms-of-reference.pdf",
      }),
    });
    await request("/tenders/integration-tender-1/documents", {
      method: "POST",
      body: JSON.stringify({
        id: "integration-document-2",
        originalName: "clarification.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storageProvider: "test",
        storageKey: "test/clarification.docx",
      }),
    });
    const documents = await request(
      "/tenders/integration-tender-1/documents",
    );
    assert(documents.length === 2, "Multiple tender documents were not stored.");

    const brandedTender = await request(
      "/tenders/integration-tender-1/branding",
      {
        method: "PATCH",
        body: JSON.stringify({
          branding: {
            header_base64: "data:image/png;base64,integration-header",
            footer_base64: "data:image/png;base64,integration-footer",
          },
        }),
      },
    );
    assert(
      brandedTender.branding?.header_base64 ===
        "data:image/png;base64,integration-header" &&
        brandedTender.branding?.footer_base64 ===
          "data:image/png;base64,integration-footer",
      "Tender branding did not persist independently.",
    );

    await request("/matches/bulk", {
      method: "POST",
      body: JSON.stringify({
        tenderId: "integration-tender-1",
        positionId: "integration-position-1",
        positionTitle: "Project Manager",
        matches: [
          {
            id: "integration-match-1",
            expertId: "integration-expert-1",
            score: 91,
            risk_level: "LOW",
          },
        ],
      }),
    });
    const matches = await request(
      "/matches?tenderId=integration-tender-1",
    );
    assert(matches.length === 1 && matches[0].score === 91, "Match save failed.");

    const generatedCv = await request("/generated-cvs", {
      method: "POST",
      body: JSON.stringify({
        id: "integration-cv-1",
        expertId: "integration-expert-1",
        tenderId: "integration-tender-1",
        matchId: "integration-match-1",
        mode: "NORMAL",
        filename: "integration-expert.docx",
      }),
    });
    assert(generatedCv.id === "integration-cv-1", "Generated CV save failed.");

    const branding = await request("/brandings", {
      method: "POST",
      body: JSON.stringify({
        id: "integration-branding-1",
        name: "Integration Branding",
      }),
    });
    assert(branding.name === "Integration Branding", "Branding save failed.");

    const unauthorisedUsers = await fetch(`${baseUrl}/users`, {
      headers: { "content-type": "application/json" },
    });
    assert(
      unauthorisedUsers.status === 403,
      "User administration did not require administrator access.",
    );

    const manualUser = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "integration-admin-token",
      },
      body: JSON.stringify({
        name: "Manual User",
        email: "manual@via-int.com",
      }),
    });
    assert(
      manualUser.status === 405,
      "Manual user provisioning was not blocked.",
    );

    await pool.query(
      `INSERT INTO users (id, name, email, role_code, status_code, data)
       VALUES ('integration-user-1', 'Integration User', 'integration@via-int.com', 'ADMIN', 'ACTIVE', $1::JSONB)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [JSON.stringify({ role: "Admin", status: "Active", ssoProvider: "via-portal" })],
    );
    const users = await request("/users");
    assert(
      users.some((user: any) => user.email === "integration@via-int.com"),
      "Portal-linked user read failed.",
    );

    await request("/settings/integration.setting", {
      method: "PUT",
      body: JSON.stringify({ value: { enabled: true } }),
    });
    const setting = await request("/settings/integration.setting");
    assert(setting.value.enabled === true, "Setting round-trip failed.");

    await request("/preferences/integration-user-1/visible-modules", {
      method: "PUT",
      body: JSON.stringify({ value: ["EXPERTS", "TENDERS"] }),
    });
    const preference = await request(
      "/preferences/integration-user-1/visible-modules",
    );
    assert(
      preference.value.length === 2,
      "User preference round-trip failed.",
    );

    const stats = await request("/stats");
    assert(
      stats.totalExperts === 2 &&
        stats.activeTenders === 2 &&
        stats.totalMatches === 2 &&
        stats.cvsGenerated === 2,
      "Statistics endpoint returned incorrect counts.",
    );

    await request("/tenders/integration-tender-1", { method: "DELETE" });
    const statsAfterTenderDelete = await request("/stats");
    assert(
      statsAfterTenderDelete.activeTenders === 1 &&
        statsAfterTenderDelete.totalMatches === 1 &&
        statsAfterTenderDelete.cvsGenerated === 1,
      "Tender deletion did not update related counters.",
    );
    const matchesAfterTenderDelete = await request(
      "/matches?tenderId=integration-tender-1",
    );
    const cvsAfterTenderDelete = await request("/generated-cvs");
    assert(
      matchesAfterTenderDelete.length === 0 &&
        !cvsAfterTenderDelete.some(
          (cv: any) => cv.tenderId === "integration-tender-1",
        ),
      "Tender deletion left related matches or generated CVs behind.",
    );

    console.log({
      ok: true,
      tested: [
        "health",
        "bootstrap/reference data",
        "browser migration preview/import/re-import",
        "experts",
        "tenders",
        "multiple tender documents",
        "tender branding persistence",
        "matches",
        "generated CVs",
        "brandings",
        "users",
        "settings",
        "preferences",
        "statistics",
        "tender deletion cascade",
      ],
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  }
}

runApiIntegrationTest().catch((error) => {
  console.error("PostgreSQL API integration test failed:", error);
  process.exitCode = 1;
});
