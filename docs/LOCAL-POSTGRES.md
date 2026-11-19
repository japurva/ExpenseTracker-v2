# Local PostgreSQL (no Docker, no Supabase account)

`npm run dev:backend` gives you a **real** PostgreSQL 18 database plus a Supabase-compatible API on your
machine, so the sign-in → guest-migration → two-way-sync paths can be exercised exactly as they will run
against hosted Supabase. Row Level Security is genuinely enforced — it is not a mock.

---

## 1. What runs, and where

| Piece | Where | Notes |
| --- | --- | --- |
| Isolated PostgreSQL 18 cluster | `.dev/pgdata`, port **5433** | created on first run; **never** touches the system service on 5432 |
| `expense_dev` database | inside that cluster | migrations applied on every boot (idempotent) |
| Supabase-compatible API | `http://127.0.0.1:54321`, plus `http://<LAN-IP>:54321` | GoTrue auth subset + PostgREST subset |
| Row counts | `GET /dev/summary` | handy after a migration |
| Demo account | `demo@expensetracker.dev` / `expense123` | seeded on first boot |

Ports are chosen so nothing collides with a normal PostgreSQL install or a running Supabase project.

```
npm run dev:backend
  └─ node tools/dev-backend/server.mjs
       ├─ pg.mjs       cluster lifecycle (initdb / pg_ctl)
       ├─ auth.mjs     scrypt passwords, HS256 JWTs
       ├─ rest.mjs     SQL builder for the PostgREST subset
       └─ server.mjs   HTTP server + bootstrap + RLS session
```

---

## 2. Boot sequence

What happens on `npm run dev:backend` ([server.mjs](../tools/dev-backend/server.mjs)):

1. **`ensureCluster()`** ([pg.mjs](../tools/dev-backend/pg.mjs))
   - no `.dev/pgdata` → `initdb -D .dev/pgdata -U postgres --auth=trust --encoding=UTF8`
   - already running → reuse it (`pg_ctl status`)
   - otherwise → `pg_ctl -D .dev/pgdata -l .dev/postgres.log -o "-p 5433" -w start`
2. **Admin connection** to `postgres` to create roles `anon` and `authenticated` if absent.
3. **Supabase-managed pieces** the migration assumes exist:
   - `create schema auth`
   - `auth.users (id, email, encrypted_password, created_at, updated_at)`
   - `auth.uid()` → `nullif(current_setting('request.jwt.claim.sub', true), '')::uuid`
4. **Database** `expense_dev` created if missing.
5. **Migrations applied in filename order**, both idempotent:
   - `20261024120000_init_expensetracker.sql` — `users`, `categories`, `transactions`, `budgets`,
     RLS, 6 shared default categories
   - `20261025120000_payment_sources.sql` — `payment_sources`, `transactions.payment_source_id`, RLS
6. **Demo user seeded** into `auth.users`; the `on_auth_user_created` trigger mirrors it into `public.users`.
7. **HTTP server** listens on `0.0.0.0:54321` (`DEV_API_HOST`), so both the host and phones on the LAN
   can reach it. It prints each LAN URL it is reachable on.

---

## 3. Why RLS is real here

Every REST request is handled inside one transaction ([server.mjs](../tools/dev-backend/server.mjs)):

```sql
begin;
select set_config('request.jwt.claim.sub', '<sub from the JWT>', true);
set local role authenticated;   -- RLS policies now apply to this statement
-- …the caller's select / insert / update / delete…
commit;
```

So the policies in the migration are the ones actually deciding access:

- a `select` only returns the caller's rows (plus shared default categories);
- `insert` with a forged `user_id` is rejected → **HTTP 403**;
- `anon` has no grants at all, matching "guests are local-only".

This is why the shim is worth having: a policy mistake shows up locally instead of in production.

---

## 4. What the API implements

**Auth (`/auth/v1/*`)** — `POST signup`, `POST token` (password grant + refresh), `POST logout`,
`GET user`. Passwords are `scrypt` hashed; access tokens are HS256 JWTs with a 1-hour TTL and a 30-day
refresh token.

**REST (`/rest/v1/*`)** — the subset the app actually calls:

| Feature | Support |
| --- | --- |
| `select` | plain column lists (`*` allowed); embedded selects are rejected |
| Filters | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is null`, `not.is.null` |
| Ordering / paging | `order=col.desc`, `limit`, `offset`, `Range` headers |
| Writes | `insert`, `update`, `delete` with `Prefer: return=representation` |
| Upserts | `on_conflict=…` → `do nothing` or `do update set …` |

Columns are whitelisted per table in [rest.mjs](../tools/dev-backend/rest.mjs), so a typo fails fast instead
of silently passing.

---

## 5. Configuration

`.env` already points at the local API:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=dev-anon-key
```

The shim ignores the anon key value but supabase-js requires it to be present.

| Env var | Default | Purpose |
| --- | --- | --- |
| `DEV_PG_PORT` | `5433` | cluster port |
| `DEV_PG_DATA` | `.dev/pgdata` | cluster directory |
| `DEV_PG_LOG` | `.dev/postgres.log` | server log file |
| `DEV_DB_NAME` | `expense_dev` | database name |
| `DEV_API_PORT` | `54321` | API port |
| `DEV_API_HOST` | `0.0.0.0` | API bind address — phones need a LAN-reachable bind; `127.0.0.1` keeps it loopback-only |
| `DEV_JWT_SECRET` | dev placeholder | JWT signing secret |
| `PGBIN` | auto-detected | `bin` directory of a PostgreSQL install |

Running a second, disposable cluster (useful for a clean end-to-end test):

```bash
# PowerShell
$env:DEV_PG_PORT='5434'; $env:DEV_PG_DATA="$PWD\.dev\pgdata-e2e"
$env:DEV_PG_LOG="$PWD\.dev\postgres-e2e.log"; $env:DEV_DB_NAME='expense_e2e'
npm run dev:backend

# bash
DEV_PG_PORT=5434 DEV_PG_DATA=$PWD/.dev/pgdata-e2e \
DEV_PG_LOG=$PWD/.dev/postgres-e2e.log DEV_DB_NAME=expense_e2e npm run dev:backend
```

If `postgres` binaries are not found, the shim throws with the expected path — install PostgreSQL 18 or set
`PGBIN`.

---

## 6. Inspecting the database

**Row counts (no client needed):**

```bash
curl http://127.0.0.1:54321/dev/summary
# [{"table_name":"categories","rows":7},{"table_name":"payment_sources","rows":4}, …]
```

**Ad-hoc SQL with `psql`** (add `…\18\bin` to `PATH`, or use the full path):

```bash
psql "postgresql://postgres@127.0.0.1:5433/expense_dev" -c "\dt"
psql "postgresql://postgres@127.0.0.1:5433/expense_dev" -c "select name, kind, last4 from payment_sources;"
```

**From a throwaway Node script** (the project already has `pg` as a dev dependency):

```js
import { Client } from 'pg';
const client = new Client({ host: '127.0.0.1', port: 5433, database: 'expense_dev', user: 'postgres' });
await client.connect();
console.log((await client.query('select description, amount from transactions order by created_at')).rows);
await client.end();
```

Connection string: `postgresql://postgres@127.0.0.1:5433/expense_dev` (trust auth, no password).

**Verify RLS by hand** — run this as `authenticated` with no claims set; it must return **zero rows**, not an
error:

```sql
begin;
set local role authenticated;
select count(*) from public.transactions;   -- 0
rollback;
```

---

## 7. Stop, reset, restart

```bash
# stop cleanly (Windows path shown; drop the drive prefix on macOS/Linux)
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D .dev/pgdata -m fast stop

# reset everything — schema, rows, demo user, logs
rm -rf .dev            # PowerShell: Remove-Item .dev -Recurse -Force
```

`.dev/` is gitignored, so a reset never touches source.

**Windows gotcha.** Stop the cluster with `pg_ctl`, not by killing the terminal that started it. A killed
parent can leave `postgres --forkchild="io_worker"` alive holding port 5433 and the log file; `pg_ctl start`
then fails with `could not open log file … Permission denied`. Fix: `Stop-Process -Id <child pid> -Force`
after finding it with `Get-CimInstance Win32_Process -Filter "Name='postgres.exe'"`, then start again.
Symptom→cause table:

| Symptom | Cause | Fix |
| --- | --- | --- |
| `could not open log file … Permission denied` | orphaned child still holds the log | kill the orphan, or set `DEV_PG_LOG` to a new file |
| `pg_ctl: server does not shut down` | same orphan | `-m immediate stop`, then kill the child |
| port 5433 in use | cluster already running, or orphan | `(Test-NetConnection 127.0.0.1 -Port 5433).TcpTestSucceeded`, then kill or re-port |
| `[dev-db] already running on port 5433` | reuse path | correct behaviour — it is your existing cluster |

---

## 8. Reaching the local API from a device

The API binds every interface by default, and `src/lib/supabase.ts` rewrites a loopback URL to the host
Metro is served from — so the same `.env` works on every target without edits.

| Target | `EXPO_PUBLIC_SUPABASE_URL` | Why |
| --- | --- | --- |
| Web / iOS simulator | `http://127.0.0.1:54321` | the simulator shares the host network |
| Android emulator | `http://127.0.0.1:54321` | LAN mode: rewritten to the host's LAN IP. With `--localhost`: `adb reverse tcp:54321 tcp:54321` |
| Physical device (Wi-Fi) | `http://127.0.0.1:54321` | rewritten to the host's LAN IP (`Constants.expoConfig.hostUri`) |
| Physical Android (USB only, no Wi-Fi) | `http://127.0.0.1:54321` | `adb reverse tcp:54321 tcp:54321`, and start Metro with `--localhost` |
| Hosted Supabase | the project URL | never rewritten — only loopback URLs are |

Two things that break the rewrite, both visible in the dev log as
`[supabase] http://127.0.0.1:54321 is device-local; using …` (or its absence):

- **Tunnel mode** (`expo start --tunnel`) — the tunnel host cannot proxy port 54321. Use LAN mode.
- **Windows firewall** blocking inbound `node.exe` on 54321 — allow it once, or add a rule for the port.
  The server prints `From a device on your LAN  http://<ip>:54321`; open that URL on the phone to confirm.

Restart Metro after changing `.env` — `EXPO_PUBLIC_*` values are inlined at bundle time.

---

## 9. Pointing the app back at hosted Supabase

Replace the two values in `.env` with the project URL and anon key, then restart `npm start`. No code
change: `src/lib/supabase.ts` reads the same variables. Apply the migrations to the hosted project first —
see [DEPLOYMENT.md](./DEPLOYMENT.md) phase 1.

---

## 10. What this shim does *not* do

Enough to develop against, deliberately not a full Supabase:

- no storage bucket (receipt images stay on-device)
- no email, so sign-up verification is stubbed
- no realtime subscriptions, no embedded `select` joins
- no password reset / magic links
- single-process, trust auth, dev JWT secret — **dev only**. The API listens on every interface so phones can
  reach it; set `DEV_API_HOST=127.0.0.1` when you only need the host machine, and never expose this port
  beyond your own network.
