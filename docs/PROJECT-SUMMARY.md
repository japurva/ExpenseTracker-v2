# ExpenseTracker — Project Summary

Cross-platform personal finance app: record income/expenses, scan receipts, set budgets, and sync to the
cloud only if the user wants an account. Requirements live in
[SRS-ExpenseTracker.md](../SRS-ExpenseTracker.md).

- **Offline-first.** Every feature works without an account. Guest data lives on the device (MMKV on
  mobile, `localStorage` on web). Signing in uploads it and turns on two-way sync.
- **One codebase, three targets.** iOS, Android and web from the same Expo Router routes.
- **Real Postgres.** Supabase schema with Row Level Security, exercised locally against a real
  PostgreSQL 18 cluster (see [LOCAL-POSTGRES.md](./LOCAL-POSTGRES.md)).

---

## 1. Stack

| Layer | Choice | Version |
| --- | --- | --- |
| Expo SDK | `expo` | `~58.0.19` |
| React Native | New Architecture only (SDK 58 removed the toggle) | `0.88.0` |
| React | | `19.3.0` |
| Routing | Expo Router, file-based, typed routes | `~58.0.26` |
| Language | TypeScript, `strict`, React Compiler on | `~6.0.3` |
| Styling | NativeWind (Tailwind) | `4.2.7` / `3.4.19` |
| Client state | Zustand + `persist` | `5.0.16` |
| Local storage | `react-native-mmkv` (native) / `localStorage` (web) | `4.3.2` |
| Lists | `@shopify/flash-list` | `2.3.2` |
| Charts | Victory Native XL + Skia (native), Recharts (web) | `42.0.1` / `3.10.1` |
| OCR | ML Kit text recognition (native), tesseract.js (web) | `2.x` / `7.x` |
| Backend | Supabase (PostgreSQL 18 + GoTrue + PostgREST) | `@supabase/supabase-js 2.118` |
| Builds | EAS (dev client, preview, production) | `expo-dev-client 58.0.15` |
| Node | `engines.node >= 26.0.0`, `.nvmrc` = 26 | — |

Expo Go **cannot** run this app — MMKV (Nitro modules), ML Kit and Skia are native. Use a development
build; see [RUN-ANDROID-IOS.md](./RUN-ANDROID-IOS.md).

---

## 2. Architecture

```
┌───────────────────────────── src/app (Expo Router) ─────────────────────────────┐
│  (main)/(tabs) dashboard · transactions · budgets · settings                    │
│  (main) auth · categories · payment-sources                                     │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │  hooks / selectors
┌───────────────────────────────────▼─────────────────────────────────────────────┐
│  src/components   dashboard · transactions · budgets · categories · payments · ui│
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────────┐
│  src/stores/expenseStore.ts — Zustand, persisted, single source of truth          │
│  transactions · categories · paymentSources · budgets · deletions (tombstones)    │
└───────────┬───────────────────────────────────────────────┬─────────────────────┘
            │ src/lib/storage  (MMKV / localStorage)         │ src/services
            ▼                                               ▼
      on-device persistence                    ┌──────────────────────────────────┐
                                              │ syncService   pull → merge → push │
                                              │ pullService   read cloud snapshot │
                                              │ cloudMerge    pure merge rules    │
                                              │ guestMigrationService  push engine │
                                              │ transactionService  cloud CRUD     │
                                              │ export/*  CSV (native + web)       │
                                              │ ocr/*  ML Kit / tesseract          │
                                              └──────────────┬──────────────────┘
                                                             │ supabase-js (RLS)
                                              ┌──────────────▼──────────────────┐
                                              │ PostgreSQL 18 · users · categories│
                                              │ transactions · payment_sources    │
                                              │ budgets · RLS on every table     │
                                              └─────────────────────────────────┘
```

### Sync model

The store is authoritative; the cloud is a replica.

1. **Adopt** — cloud rows created outside the app (SQL editor, imports) get their `client_id` stamped so
   later pushes match instead of duplicating.
2. **Replay deletes** — every delete leaves a tombstone in `deletions`; it is re-sent until the cloud accepts it.
3. **Pull + merge** — `mergeCloudSnapshot` applies pure rules from
   [cloudMerge.ts](../src/services/cloudMerge.ts): a locally `pending` row wins, otherwise the cloud row
   wins, tombstones block resurrection, and seeded bank/card twins are folded into the account's own rows.
   Pulling **before** pushing is what stops a freshly signed-in device from re-uploading its seeds.
4. **Push** — only rows still `pending` travel (`getGuestSnapshot({ pendingOnly: true })`), upserted on
   `(user_id, client_id)`.
5. **Mark** — only rows that landed become `synced`; failures stay `pending` and retry next time.

Sync is idempotent: running it twice reports `Uploaded 0` on the second pass.

---

## 3. Data model

| Table | Purpose | Notes |
| --- | --- | --- |
| `users` | profile mirror of `auth.users` | created by trigger on signup |
| `categories` | expense/income buckets | 6 shared defaults (`user_id is null`, read-only) + per-user rows |
| `payment_sources` | banks, cards, wallets, cash | one row per account, `kind` + optional `last4` |
| `transactions` | the ledger | `category_id` (set null on delete), `payment_source_id` (set null on delete), `payment_method` kind kept for history |
| `budgets` | monthly limit per category | unique on `(user_id, category_id, month_year)` |

Cross-cutting columns: `client_id` (device row id, the upsert arbiter), `created_at`, `updated_at`,
`synced_at`. RLS is enabled on all five tables; `anon` has no grants, so guests are strictly local.

Two idempotent migrations, applied in order:

| File | Adds |
| --- | --- |
| [20261024120000_init_expensetracker.sql](../supabase/migrations/20261024120000_init_expensetracker.sql) | four tables + RLS + default categories |
| [20261025120000_payment_sources.sql](../supabase/migrations/20261025120000_payment_sources.sql) | `payment_sources` + `transactions.payment_source_id` + RLS |

---

## 4. Feature status

| Area | State | Where |
| --- | --- | --- |
| Guest CRUD for transactions / categories / budgets, fully offline | ✅ | [expenseStore.ts](../src/stores/expenseStore.ts) |
| Payment sources (multiple banks/cards, inline creation, management screen) | ✅ | [payment-sources.tsx](../src/app/(main)/payment-sources.tsx) |
| Dashboard: guest/cloud banner, month switcher, summary cards | ✅ | [dashboard.tsx](../src/app/(main)/(tabs)/dashboard.tsx) |
| Analytics chart (6-month, grouped bars) | ✅ native Skia + web Recharts | [analytics-chart.tsx](../src/components/dashboard/analytics-chart.tsx) |
| Expense pie charts by category & payment source | ✅ native Victory/Skia + web Recharts | [analytics-pie-charts.tsx](../src/components/analytics/analytics-pie-charts.tsx) |
| Fast transaction list | ✅ FlashList, grouped by year → month with collapsible sections | [transaction-list.tsx](../src/components/transactions/transaction-list.tsx) |
| Add/edit/delete sheet with calendar date picker | ✅ | [transaction-form-modal.tsx](../src/components/transactions/transaction-form-modal.tsx) |
| Receipt OCR → prefilled form | ✅ native ML Kit / web tesseract.js | [receiptParser.ts](../src/utils/receiptParser.ts) |
| Category management (colour + icon pickers) | ✅ | [categories.tsx](../src/app/(main)/categories.tsx) |
| Budgets with 80% warn / 100% danger bars | ✅ | [budgets.tsx](../src/app/(main)/(tabs)/budgets.tsx) |
| Supabase auth + guest migration on sign-in | ✅ | [auth.tsx](../src/app/(main)/auth.tsx) |
| Two-way cloud sync (pull, push, tombstones, edits) | ✅ | [syncService.ts](../src/services/syncService.ts) |
| CSV export (iOS / Android share sheet, web download) | ✅ | [exportTransactions.ts](../src/services/export/exportTransactions.ts) |
| Receipt images uploaded to cloud storage | ❌ local URI only | `transactions.receipt_url` holds the device path |
| In-app account deletion | ❌ not implemented | required by App Store 5.1.1(v) before release |
| Automated tests / CI | ❌ none committed | logic was verified with throwaway harnesses |
| OTA updates | ❌ `expo-updates` not installed | see [DEPLOYMENT.md](./DEPLOYMENT.md) phase 8 |

---

## 5. Source map

```
src/
  app/                     routes only (every file is a screen)
    (main)/(tabs)/         dashboard · transactions · budgets · settings
    (main)/                auth · categories · payment-sources
  components/              dashboard · transactions · budgets · categories · payments · ui · analytics
                           analytics include: date-range-selector, expense-category-pie, expense-payment-source-pie, analytics-pie-charts
                           transactions include: list, row, year-section-header, month-section-header
  constants/               category-options · payment-options · theme
  hooks/                   useAuth · useReceiptOCR
  lib/                     supabase (lazy client) · storage (+ .web) · dates (monthKey, dayKey, yearKey, groupTransactionsByYearAndMonth) · format · ids
  services/                sync · pull · cloudMerge · guestMigration · transaction · auth · export/ · ocr/
  stores/                  expenseStore · selectors
  types/                   models · sync · database.types
  utils/                   receiptParser · csv · analytics (filterExpensesByRange, groupExpensesByCategory, groupExpensesByPaymentSource, DateRange, ExpenseSlice)
supabase/migrations/       schema + RLS
tools/dev-backend/         local PostgreSQL 18 + Supabase-compatible API
docs/                      this documentation set
```

---

## 6. Verification commands

```bash
npm run typecheck   # tsc --noEmit
npm run doctor      # expo-doctor (20/20 expected)
npm run lint        # expo lint
```

Current state: typecheck clean, `expo-doctor` 20/20, iOS and web bundles export successfully.

---

## Next reading

| Doc | For |
| --- | --- |
| [SETUP.md](./SETUP.md) | every setup command, start to finish |
| [LOCAL-POSTGRES.md](./LOCAL-POSTGRES.md) | how the local database/API works and how to inspect it |
| [RUN-ANDROID-IOS.md](./RUN-ANDROID-IOS.md) | running on Android and iOS, step by step |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | shipping to stores, web, and the backend |
| [ANALYTICS-PIE-CHARTS.md](./ANALYTICS-PIE-CHARTS.md) | planned category / payment-source expense pie charts with month / year / custom-range scoping |
