import dotenv from "dotenv";
dotenv.config({ override: true });
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "node:path";
import multer from "multer";
import { createPostgresPool } from "./src/backend/database/postgres.ts";
import { runPostgresMigrations } from "./src/backend/database/migrationRunner.ts";
import { createPostgresApiRouter } from "./src/backend/api/postgresRouter.ts";
import { createPortalSso } from "./src/backend/auth/portalSso.ts";

async function startServer() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL is required. Stage 6 removed the SQLite and browser-storage fallbacks.",
    );
  }

  const app = express();
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  const upload = multer({ dest: "uploads/" });
  const postgresPool = createPostgresPool();

  await runPostgresMigrations(postgresPool);
  const portalSso = createPortalSso(postgresPool);
  app.set("trust proxy", 1);
  app.use(portalSso.consumePortalToken);
  app.use(portalSso.requireSession);
  app.use(express.json({ limit: "50mb" }));
  app.use("/api/auth", portalSso.router);
  app.use("/api/v2", createPostgresApiRouter(postgresPool));

  app.get("/api/env-check", (_req, res) => {
    res.json({
      ok: true,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
      database: "postgresql",
    });
  });

  app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ filename: req.file.filename, originalname: req.file.originalname });
  });
  app.get("/uploads/:filename", (req, res) => {
    res.sendFile(path.join(process.cwd(), "uploads", req.params.filename));
  });

  app.post("/api/parse-cv", async (req, res) => {
    try {
      const { runParseCVText } = await import("./src/backend/ai.ts");
      res.json({ experts: await runParseCVText(req.body.text, req.body.taxonomy) });
    } catch (error: any) {
      console.error("Parse CV API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/parse-tender", async (req, res) => {
    try {
      const { runParseTenderText } = await import("./src/backend/ai.ts");
      res.json({ tender: await runParseTenderText(req.body.text) });
    } catch (error: any) {
      console.error("Parse Tender API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/match-engine", async (req, res) => {
    try {
      const { runVectorMatchEngine } = await import("./src/backend/ai.ts");
      const { tender, positionId, experts } = req.body;
      res.json({ matches: await runVectorMatchEngine(tender, positionId, experts) });
    } catch (error: any) {
      console.error("Match API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const expertAction = (
    route: string,
    action: "translateExpertProfile" | "runRenderCV" | "runAdaptCV" | "runOptimizeCV",
  ) => {
    app.post(route, async (req, res) => {
      try {
        const ai = await import("./src/backend/ai.ts");
        const { expert, tender, positionTitle, language, isAccepted } = req.body;
        const result =
          action === "translateExpertProfile"
            ? await ai[action](expert, language)
            : action === "runOptimizeCV"
              ? await ai[action](expert, tender, positionTitle, isAccepted)
              : await ai[action](expert, tender, positionTitle);
        res.json(action === "translateExpertProfile" ? { translated: result } : { expert: result });
      } catch (error: any) {
        console.error(`${action} API Error:`, error);
        res.status(500).json({ error: error.message });
      }
    });
  };
  expertAction("/api/expert/translate", "translateExpertProfile");
  expertAction("/api/expert/render", "runRenderCV");
  expertAction("/api/expert/adapt", "runAdaptCV");
  expertAction("/api/expert/optimize", "runOptimizeCV");

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`PostgreSQL-only server running on http://localhost:${port}`);
  });
  const shutdown = () => {
    server.close(() => void postgresPool.end());
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

startServer().catch((error) => {
  console.error("Server startup failed:", error);
  process.exitCode = 1;
});
