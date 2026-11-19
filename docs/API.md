# API Reference — ExpenseTracker

The app talks to a PostgREST-compatible API. In development that API is a lightweight Node shim
(`tools/dev-backend/server.mjs`) backed by a real PostgreSQL 18 cluster; in production it is hosted
Supabase (GoTrue + PostgREST + RLS). The app code is identical in both cases — it uses
`@supabase/supabase-js` against `EXPO_PUBLIC_SUPABASE_URL`.

> **No separate `api/` folder exists.** Server-side API logic lives in `tools/dev-backend/`;
> client-side calls live in `src/services/` (`transactionService.ts`, `pullService.ts`,
> `syncService.ts`, `authService.ts`). This document describes the *HTTP contract* those layers
> speak.

---

## 1. Base URL & authentication

| Environment | Base URL | Notes |
|-------------|----------|-------|
| Local dev | `http://127.0.0.1:54321` | `npm run dev:backend`; bound to `0.0.0.0` so phones on the LAN can reach it |
| Hosted Supabase | project URL (`.env`) | set `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

All requests that touch user data require a `Authorization: Bearer <access_token>` header obtained
from `/auth/v1/token`. Guests (no account) never call the API — all data stays on the device
(MMKV / `localStorage`).

The anon key is required by supabase-js but is otherwise ignored by the dev shim.

---

## 2. Auth endpoints — `POST /auth/v1/*`

All bodies are JSON. These mirror the GoTrue subset the app needs.

### 2.1 `POST /auth/v1/signup`

Create a new account and immediately issue a session.

**Request body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | Yes | Must contain `@` |
| `password` | string | Yes | Minimum 6 characters |

**Success (200)** — returns a `sessionPayload`:

```json
{
  "access_token": "<HS256 JWT, 1 h TTL>",
  "token_type": "bearer",
  "expires_in": 28800,
  "expires_at": 1795000000,
  "refresh_token": "<HS256 JWT, 30 d TTL>",
  "user": {
    "id": "<uuid>",
    "aud": "authenticated",
    "role": "authenticated",
    "email": "user@example.com",
    "email_confirmed_at": "<iso8601>",
    "created_at": "<iso8601>",
    "updated_at": "<iso8601>",
    "app_metadata": { "provider": "email", "providers": ["email"] },
    "user_metadata": {}
  }
}
```

**Errors**

| Status | Body | Meaning |
|--------|------|---------|
| `400` | `{ code: 'validation_failed', msg: '…' }` | Bad email or short password |
| `422` | `{ code: 'user_already_exists', msg: 'User already registered' }` | Email taken |

### 2.2 `POST /auth/v1/token?grant_type=password`

Log in with email + password (Resource Owner Password Credentials grant).

**Query string** — `grant_type=password`

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `email` | string | Yes |
| `password` | string | Yes |

**Success (200)** — same `sessionPayload` shape as signup.

**Errors**

| Status | Body |
|--------|------|
| `400` | `{ error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_grant', msg: '…' }` |

### 2.3 `POST /auth/v1/token?grant_type=refresh_token`

Rotate an expired access token using a refresh token.

**Query string** — `grant_type=refresh_token`

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `refresh_token` | string | Yes |

**Success (200)** — a fresh `sessionPayload`.

**Errors**

| Status | Body |
|--------|------|
| `400` | `{ error: 'invalid_grant', code: 'invalid_grant', … }` |
| `400` | `{ error: 'unsupported_grant_type', msg: 'Unsupported grant_type X' }` |

### 2.4 `POST /auth/v1/logout`

**Success (204)** — No Content. The client discards its tokens locally; the shim is stateless so
there is no server-side revocation.

### 2.5 `GET /auth/v1/user`

Return the profile of the bearer-token holder.

**Headers** — `Authorization: Bearer <access_token>`

**Success (200)** — the `user` object (same shape as inside `sessionPayload`).

**Errors**

| Status | Body |
|--------|------|
| `401` | `{ code: 401, msg: 'invalid claim: missing sub claim' }` |
| `404` | `{ code: 'user_not_found', msg: 'User not found' }` |

---

## 3. REST endpoints — `GET|POST|PATCH|DELETE /rest/v1/{table}`

One generic endpoint per table. `{table}` must be one of:

| Table | Purpose |
|-------|---------|
| `users` | profile mirror of `auth.users` |
| `categories` | expense/income buckets (6 shared defaults + per-user rows) |
| `transactions` | the ledger |
| `payment_sources` | banks, cards, wallets, cash |
| `budgets` | monthly limit per category |

Every request runs inside a transaction with `set local role authenticated`, so **Row Level
Security is genuinely enforced** — a caller only ever sees/edits their own rows (plus shared
default categories). `anon` has no grants, so unauthenticated requests get nothing.

### 3.1 `GET /rest/v1/{table}` — list / read rows

**Query parameters** (all optional unless noted)

| Param | Example | Meaning |
|-------|---------|---------|
| `select` | `select=id,name,type` | Column whitelist; `*` = all columns. Embedded selects (parentheses/colons) are rejected |
| `eq` / `neq` / `gt` / `gte` / `lt` / `lte` | `user_id=eq.<uuid>` | Equality / inequality / comparison filters |
| `like` / `ilike` | `name=ilike.*food*` | Pattern match; `*` → SQL `%` |
| `is` | `client_id=is.null` | `is.null`, `is.true`, `is.false` |
| `not` | `client_id=not.is.null` | Inverted filter (only `not.is.null` supported) |
| `order` | `order=date.desc` or `order=created_at.asc.nullslast` | Sort column + direction + null placement |
| `limit` | `limit=50` | Max rows returned |
| `offset` | `offset=100` | Rows to skip |
| `Range` header | `Range: 0-49` | Alternative paging; translated to `limit`/`offset` |

**Success (200)** — JSON array of row objects.

**Headers** — `Accept: application/vnd.pgrst.object+json` requests a single object; if the result is
not exactly one row, returns `406 PGRST116`.

**Example**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:54321/rest/v1/transactions?select=id,amount,type,date&user_id=eq.$UID&order=date.desc&limit=50"
```

### 3.2 `POST /rest/v1/{table}` — insert rows

**Body** — a JSON object, or an array of objects for bulk insert.

**Query parameters**

| Param | Example | Meaning |
|-------|---------|---------|
| `on_conflict` | `on_conflict=user_id,client_id` | Upsert arbiter columns; missing columns → `do nothing`, otherwise `do update set …` |
| `Prefer: resolution=ignore-duplicates` header | — | Conflict rows are skipped instead of updated |

**Success**

| Prefer header | Status | Body |
|---------------|--------|------|
| `Prefer: return=representation` | `201` | The inserted/upserted rows |
| (none) | `201` | empty |

**Example** (idempotent guest-migration push)

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Prefer: return=representation" \
  -d '[{"user_id":"...","client_id":"dev-local-1","amount":"12.50","type":"expense","date":"2026-10-24"}]' \
  "http://127.0.0.1:54321/rest/v1/transactions?on_conflict=user_id,client_id"
```

### 3.3 `PATCH /rest/v1/{table}` — update rows

Rows to update are identified by filter query parameters (same operator set as `GET`).

**Body** — a JSON object of column → value pairs. At least one column required.

**Success**

| Prefer header | Status | Body |
|---------------|--------|------|
| `Prefer: return=representation` | `200` | The updated rows |
| (none) | `204` | No Content |

**Example**

```bash
curl -X PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":"15.00"}' \
  "http://127.0.0.1:54321/rest/v1/transactions?id=eq.<uuid>"
```

### 3.4 `DELETE /rest/v1/{table}` — delete rows

Rows to delete are identified by filter query parameters.

**Success**

| Prefer header | Status | Body |
|---------------|--------|------|
| `Prefer: return=representation` | `200` | The deleted rows |
| (none) | `204` | No Content |

**Example**

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:54321/rest/v1/transactions?client_id=eq.<local-id>"
```

---

## 4. Per-table column reference

Columns listed here are the **whitelist** the dev shim accepts (`rest.mjs` `TABLES`). Any other
column name in `select`, filter, insert, or update returns `400`.

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, references `auth.users(id)` |
| `email` | varchar(255) | unique, not null |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` |

### `categories`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `user_id` | uuid | FK → `users(id)`, nullable for shared defaults |
| `name` | varchar(100) | not null |
| `type` | varchar(20) | `income` \| `expense`, check constraint |
| `icon` | varchar(50) | |
| `color` | varchar(20) | |
| `is_default` | boolean | default `false`; shared defaults have `user_id IS NULL` |
| `client_id` | uuid | device-local id, upsert arbiter; unique with `user_id` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `transactions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `users(id)`, not null |
| `category_id` | uuid | FK → `categories(id)`, `ON DELETE SET NULL` |
| `amount` | numeric(12,2) | not null, `> 0` |
| `type` | varchar(20) | `income` \| `expense` \| `transfer` |
| `payment_method` | varchar(50) | denormalised kind (kept for history) |
| `payment_source_id` | uuid | FK → `payment_sources(id)`, `ON DELETE SET NULL` |
| `description` | text | |
| `receipt_url` | text | device-local URI only (no cloud storage in this release) |
| `is_ocr_parsed` | boolean | default `false` |
| `raw_ocr_text` | text | |
| `date` | timestamptz | not null |
| `client_id` | uuid | upsert arbiter; unique with `user_id` |
| `created_at` / `updated_at` / `synced_at` | timestamptz | `synced_at` default `now()` |

### `payment_sources`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `users(id)`, not null |
| `name` | varchar(100) | not null |
| `kind` | varchar(20) | `cash` \| `bank` \| `credit_card` \| `debit_card` \| `wallet` \| `upi` \| `other` |
| `last4` | varchar(4) | optional, digits only |
| `client_id` | uuid | upsert arbiter; unique with `user_id` |
| `created_at` / `updated_at` | timestamptz | |

### `budgets`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `users(id)`, not null |
| `category_id` | uuid | FK → `categories(id)`, `ON DELETE CASCADE` |
| `monthly_limit` | numeric(12,2) | not null, `> 0` |
| `month_year` | date | not null, must be the 1st of the month |
| `created_at` / `updated_at` | timestamptz | |
| Unique | `(user_id, category_id, month_year)` | |

---

## 5. Filter operator reference

Supported in `GET`, `PATCH`, `DELETE` query strings. Syntax is `column=operator.value`.

| Operator | SQL | Example |
|----------|-----|---------|
| `eq` | `=` | `user_id=eq.000…` |
| `neq` | `<>` | `type=neq.transfer` |
| `gt` | `>` | `amount=gt.100` |
| `gte` | `>=` | `date=gte.2026-01-01` |
| `lt` | `<` | `amount=lt.50` |
| `lte` | `<=` | `date=lte.2026-12-31` |
| `like` | `LIKE` (`*` → `%`) | `name=like.*Food*` |
| `ilike` | `ILIKE` (`*` → `%`) | `name=ilike.*rent*` |
| `is` | `IS NULL` / `IS true` / `IS false` | `client_id=is.null` |
| `not` | negates the inner operator | `client_id=not.is.null` |

Multiple filters are ANDed. Repeating the same filter key ORs the values.

---

## 6. Dev-only endpoint

### `GET /dev/summary`

Returns row counts for all five tables. Handy after a migration or before/after a sync.

**Success (200)**

```json
[
  { "table_name": "categories", "rows": 42 },
  { "table_name": "payment_sources", "rows": 8 },
  { "table_name": "transactions", "rows": 156 },
  { "table_name": "budgets", "rows": 12 },
  { "table_name": "users", "rows": 2 }
]
```

---

## 7. Error format

Dev-shim errors:

```json
{
  "message": "human readable",
  "code": "PGRST100 | 23505 | 42501 | DEV500 | …",
  "details": null,
  "hint": null
}
```

Auth errors use GoTrue-shaped bodies (`code`, `error_code`, `msg`, `error`, `error_description`).

PostgreSQL error codes the shim maps:
- `23505` `unique_violation` → HTTP `409`
- `42501` `insufficient_privilege` → HTTP `403`

---

## 8. How the app consumes the API

Client-side wrappers in `src/services/`:

| File | Primary API usage |
|------|-------------------|
| `authService.ts` | `/auth/v1/signup`, `/auth/v1/token`, `/auth/v1/user` |
| `pullService.ts` | `GET /rest/v1/{categories,payment_sources,transactions,budgets}` — full cloud snapshot |
| `syncService.ts` | `PATCH` (adopt `client_id`), `DELETE` (tombstone replay), then `POST …?on_conflict=user_id,client_id` (push dirty rows) |
| `transactionService.ts` | `POST`/`PATCH`/`DELETE` on `transactions`; chunked `upsertTransactionsBatch` for guest migration |

Flow on sign-in (see `syncService.syncLocalDataToCloud`):

1. `fetchCloudSnapshot()` — pull all four tables.
2. `adoptCloudRows()` — stamp `client_id` on cloud rows that lack one, so later pushes match instead of duplicating.
3. Replay delete tombstones via `DELETE … eq('client_id', localId)`.
4. Re-pull after deletes, merge locally (`cloudMerge.ts`).
5. Push only `pending` rows via `upsert(…, { onConflict: 'user_id,client_id' })`.
6. Mark landed rows `synced`.

---

## 9. Dev shim vs hosted Supabase

| Feature | Dev shim (`tools/dev-backend`) | Hosted Supabase |
|---------|-------------------------------|-----------------|
| Auth | `/auth/v1/*` HS256 JWT shim | GoTrue (email OTP/password, magic links, providers) |
| REST | Generic `/rest/v1/{table}` subset | Full PostgREST (embedded selects, views, RPC, realtime) |
| Storage buckets | Not implemented — receipt URIs stay on-device | `supabase-storage` available |
| Realtime | Not supported | `supabase-js` channels |
| Password reset / magic links | Stubbed | Built-in |
| RLS | Enforced via `set local role authenticated` per request | Native Postgres RLS |
| `anon` access | Revoked from all tables | Same |
| Intended use | Local development only (trust auth, dev JWT secret) | Production |

---

## 10. Quick curl cheat sheet

```bash
BASE=http://127.0.0.1:54321
TOKEN=<access_token from /auth/v1/token>
UID=<auth.users id>

# Sign up
curl -X POST $BASE/auth/v1/signup -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"expense123"}'

# Sign in
curl -X POST "$BASE/auth/v1/token?grant_type=password" \
  -H 'Content-Type: application/json' -d '{"email":"me@example.com","password":"expense123"}'

# Whoami
curl -H "Authorization: Bearer $TOKEN" $BASE/auth/v1/user

# List my transactions
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/rest/v1/transactions?user_id=eq.$UID&order=date.desc&limit=20"

# Upsert a transaction (idempotent on user_id + client_id)
curl -X POST "$BASE/rest/v1/transactions?on_conflict=user_id,client_id" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Prefer: return=representation' \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"'"$UID"'","client_id":"dev-1","amount":"9.99","type":"expense","date":"2026-10-24"}'

# Update by client_id
curl -X PATCH "$BASE/rest/v1/transactions?client_id=eq.dev-1" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"amount":"12.00"}'

# Delete by client_id
curl -X DELETE "$BASE/rest/v1/transactions?client_id=eq.dev-1" \
  -H "Authorization: Bearer $TOKEN"

# Row counts
curl $BASE/dev/summary
```

---

## 11. Related docs

| Doc | What it covers |
|-----|----------------|
| `LOCAL-POSTGRES.md` | Boot sequence, RLS internals, env vars, reaching the API from a device, reset |
| `PROJECT-SUMMARY.md` | Stack, architecture, sync model, data model, source map |
| `DEPLOYMENT.md` | Pointing the app at hosted Supabase, applying migrations to production |

Source: `tools/dev-backend/server.mjs`, `tools/dev-backend/rest.mjs`, `tools/dev-backend/auth.mjs`,
`supabase/migrations/`, `src/services/`.
