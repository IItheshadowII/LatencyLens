instructions
# Copilot instructions for LatencyLens (Praxis Connection Test)

## Big picture architecture
- Monorepo with **frontend** (`apps/web`) and **backend** (`apps/api`). See `docs/architecture.md` for the browser → IIS probe → API → SQLite flow.
- The browser runs all measurements directly against each Cloud IIS `/connection-probe`; the API only stores results (SQLite) and serves the admin history.
- Admin UI is a static page served by the API from `apps/api/src/public` (`/admin`).

## Key directories and files
- Frontend: `apps/web/src` (Vite + React + TS). Entry in `apps/web/src/main.tsx`.
- Backend: `apps/api/src` (Express + TS). Entry in `apps/api/src/index.ts`, DB in `apps/api/src/db.ts` + `schema.ts`.
- Probe deploy script: `deploy/Deploy-ConnectionProbe.ps1` publishes `/connection-probe` to IIS on each Cloud VM.

## Dev workflows (PowerShell)
- Install + run dev servers from repo root:
	- `npm install`
	- `npm run dev` (runs API + Web in parallel)
- Build all:
	- `npm run build`
- Production (Node): `npm run build` then `npm run start`.
- Docker (LAN): `docker compose build` then `docker compose up -d`.

## Environment configuration
- Backend env in `apps/api/.env` (see `README.md`): `PORT`, `CORS_ORIGIN`, `DATABASE_PATH`, `RATE_LIMIT_*`.
- Frontend env in `apps/web/.env`: `VITE_API_BASE` pointing to the API.

## Project-specific patterns
- Measurements are client-side only; backend should not attempt to ping Cloud URLs.
- Keep API changes compatible with the admin page in `apps/api/src/public/admin.js`.
- SQLite DB lives in `apps/api/data` by default (`DATABASE_PATH=./data/praxis.sqlite`).

## Integration points
- Cloud probe endpoint lives under IIS `/connection-probe` (installed by `Deploy-ConnectionProbe.ps1`).
- API exposes `/healthz` and `/admin`; Web expects API at `VITE_API_BASE`.
