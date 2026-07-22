# VIA CV Tool

Enterprise application for extracting expert CVs and multi-document tenders, matching experts to tender positions, and generating branded PDF/DOCX CVs.

## Runtime architecture

- React and Vite frontend
- Express server
- PostgreSQL-only persistence
- Server-side Gemini integration
- Database-backed dropdown/reference data, settings, preferences and ingestion drafts

## Local setup

Requirements: Node.js 20+ and PostgreSQL.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`.
3. Configure `GEMINI_API_KEY` and `DATABASE_URL` in `.env`.
4. Apply migrations: `npm run db:migrate`
5. Verify PostgreSQL: `npm run db:check`
6. Start the app: `npm run dev`

The server runs at `http://localhost:3000` by default. It refuses to start without a working PostgreSQL connection.

## Production

Build with `npm run build` and start with `npm start`. Run database migrations as a deployment job before starting the application. DigitalOcean PostgreSQL should use its supplied TLS connection string.

Never place database credentials, Gemini keys or admin tokens in `VITE_*` variables. See [PostgreSQL cutover](docs/POSTGRESQL_CUTOVER.md) for deployment requirements.
