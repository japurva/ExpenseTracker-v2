# ExpenseTracker — Documentation

| Doc | Read it when |
| --- | --- |
| [PROJECT-SUMMARY.md](./PROJECT-SUMMARY.md) | you want the shape of the project: stack, architecture, data model, feature status, source map |
| [SETUP.md](./SETUP.md) | you are setting the project up from scratch — every command, in order |
| [LOCAL-POSTGRES.md](./LOCAL-POSTGRES.md) | you want to know how the local PostgreSQL 18 cluster and the Supabase-compatible API work, or how to inspect the data |
| [API.md](./API.md) | complete reference for every auth / REST endpoint, query params, table schemas, and curl examples |
| [RUN-ANDROID-IOS.md](./RUN-ANDROID-IOS.md) | you are running the app on Android or iOS — emulators, devices, EAS dev builds, troubleshooting |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | you are preparing a store release, web deployment, or OTA updates |
| [ANALYTICS-PIE-CHARTS.md](./ANALYTICS-PIE-CHARTS.md) | you are planning or implementing the category / payment-source expense pie charts with month / year / custom-range scoping |

Product requirements: [SRS-ExpenseTracker.md](../SRS-ExpenseTracker.md). Contributor/agent conventions:
[AGENTS.md](../AGENTS.md).

---

## Fastest path to a running app

```bash
nvm use                       # Node 26 (.nvmrc)
npm install
cp .env.example .env          # already points at the local backend

npm run dev:backend           # terminal A — PostgreSQL 18 on :5433, API on :54321
npm start                     # terminal B — press a / i / w
```

Web needs no native build. Android and iOS need a development build — Expo Go cannot load this app's native
modules (MMKV, ML Kit, Skia). See [RUN-ANDROID-IOS.md](./RUN-ANDROID-IOS.md).

---

## Environment at a glance

| Thing | Where |
| --- | --- |
| Postgres | `.dev/pgdata`, port **5433**, database `expense_dev` |
| API | `http://127.0.0.1:54321` (GoTrue + PostgREST subset) |
| Demo login | `demo@expensetracker.dev` / `expense123` |
| Row counts | `curl http://127.0.0.1:54321/dev/summary` |
| Reset | stop the backend, delete `.dev/` (gitignored) |
| Migrations | `supabase/migrations/` — applied automatically on boot, idempotent |
