# VIA CV PostgreSQL Migration Baseline

Baseline recorded on 2026-07-20 before replacing browser persistence or frontend-owned reference lists.

## Safety status

- This folder is not a Git repository. No commit, branch, or Git rollback point exists.
- `npm.cmd run lint` passes with no TypeScript errors.
- `npm.cmd run build` passes.
- The production build reports warnings for a large JavaScript chunk and modules that are both statically and dynamically imported. These warnings existed before the database migration and do not fail the build.
- No existing application data has been deleted, converted, or moved.

## Current persistence architecture

The running frontend does not use the existing Express/SQLite routes as its primary data store. `src/lib/api.ts` reads and writes a compressed browser database under `via_enterprise_v1`.

Decoded `via_enterprise_v1` collections:

- `experts`
- `tenders`
- `matches`
- `cvs`
- `logs`
- `users`
- `brandings`

Other application-owned browser keys:

- `profileSettings`
- `hidden_modules_prefs`
- `pendingTender`
- `pendingExpert`
- `lastNotificationCheck`
- `deadlineAck`

The project contains two different SQLite definitions:

- `src/lib/db.ts`, used by `server.ts`, creates experts, tenders, matches, jobs, and settings in `via.db`.
- `db/db.ts` defines a second, currently separate schema targeting `database.sqlite`.

This split must be resolved during the PostgreSQL migration, but it has not been changed during baseline work.

## Browser backup safeguard

Settings now contains a **Data Backup** page with **Download Browser Data Backup**.

The JSON backup contains:

- exact raw values for every known application-owned browser key;
- a decoded copy of the main application database;
- format/version and export timestamp metadata.

The export is read-only. It does not clear, rewrite, decompress in place, or otherwise modify browser data.

The backup can contain expert personal information, embedded branding images, and integration credentials and must be stored securely.

## Frontend-owned business/reference lists

The following values currently originate in React/TypeScript and are candidates for PostgreSQL reference data:

| Reference group | Current locations | Current examples |
| --- | --- | --- |
| Expert types | `AddExpertModal.tsx`, `Experts.tsx` | Internal, External |
| Education levels | `AddExpertModal.tsx`, AI extraction rules | PhD, Doctorate, Master Degree, Bachelor Degree, diplomas, certificates |
| Expert position taxonomy | `constants.ts` plus fallback imports throughout the app | Project Manager, Civil Engineer Roads & Highways, Land Surveyor, and other positions |
| Tender statuses | `Tenders.tsx`, `EditTenderModal.tsx` | extraction/matching states, New, Review, Archived |
| CV generation modes | `GeneratedCVs.tsx` | Normal CV, Adapt CV, Render CV |
| Translation languages | generated CV and match pages | French, Spanish, Arabic, German |
| User roles/status defaults | `Users.tsx` | Admin and status defaults |
| Module catalogue | `Settings.tsx` | Experts, Tenders, Matching Engine, Generate CV |
| Pagination sizes | `Experts.tsx` | 10, 20, 50 |
| Match-result sorting | `MatchEngine.tsx` | score ascending/descending, name ascending |

Dynamic entity dropdowns such as branding profiles and tender records already derive their options from stored application records, although those records are currently browser-backed.

## Migration invariants

- Preserve current application behavior and object shapes.
- Import browser records without losing nested or unknown fields.
- Store all business dropdown/reference values in PostgreSQL and serve them through Express.
- Do not retain hardcoded business-value fallbacks in the frontend after cutover.
- Keep presentation-only structures such as React component layout, icon mapping, and CSS in the frontend.
- Do not remove browser persistence until PostgreSQL import counts and representative records have been verified.
