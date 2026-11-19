# ExpenseTracker

Cross-platform personal finance manager. See [SRS-ExpenseTracker.md](./SRS-ExpenseTracker.md) for requirements.

**Start here → [docs/](./docs/README.md)**

| Doc | Contents |
| --- | --- |
| [docs/PROJECT-SUMMARY.md](./docs/PROJECT-SUMMARY.md) | Stack, architecture, data model, feature status, source map |
| [docs/SETUP.md](./docs/SETUP.md) | Every setup command, start to finish |
| [docs/LOCAL-POSTGRES.md](./docs/LOCAL-POSTGRES.md) | How the local PostgreSQL 18 cluster + Supabase-compatible API work |
| [docs/RUN-ANDROID-IOS.md](./docs/RUN-ANDROID-IOS.md) | Running on Android and iOS, step by step |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Production rollout: stores, web, backend, OTA |

The sections below are the deeper reference for each subsystem.

## Stack

| Component | Version |
| --- | --- |
| Expo SDK | 58 (`expo@~58.0.19`) |
| React Native | 0.88.0 — New Architecture (SDK 58 removed `newArchEnabled`; there is no toggle) |
| React | 19.3.0 |
| Expo Router | 58.x (file-based routing in `src/app`) |
| TypeScript | 6.0.x, `strict` |
| Styling | NativeWind 4.2.x + Tailwind CSS 3.4.x |
| Node.js | 26.x (`.nvmrc` pins 26; `engines.node >= 26.0.0`) |

`expo@58.0.19` pins `react-native@0.88.0` via its bundled native modules. Do not hand-bump React Native —
use `npx expo install expo@~58.0.19 react-native@0.88.0` and let Expo resolve matching versions.

## Get started

Prerequisites: Node.js 26 (`nvm use` picks up `.nvmrc`).

1. Install dependencies

   ```bash
   npm install
   ```

2. Point the app at a backend

   ```bash
   cp .env.example .env     # Windows: copy .env.example .env
   ```

   `.env` is gitignored. For the local backend the URL is `http://127.0.0.1:54321` with
   `EXPO_PUBLIC_SUPABASE_ANON_KEY=dev-anon-key` — that value works on a phone too, the app swaps the host
   for your machine's LAN IP (see [Local backend](#local-backend-no-docker-no-supabase-account)).

3. Start the app

   ```bash
   npm run dev:backend      # optional: local PostgreSQL + API, in its own terminal
   npx expo start
   ```

Full walkthrough: [docs/SETUP.md](./docs/SETUP.md).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Start the dev server |
| `npm run android` / `npm run ios` / `npm run web` | Start on a specific platform |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run doctor` | `expo-doctor` dependency/config health checks |
| `npm run dev:backend` | Local Supabase-compatible API + isolated PostgreSQL 18 cluster |
| `npm run lint` | `expo lint` (installs ESLint on first run) |

## Development builds & EAS

Expo Go cannot run this app: `react-native-mmkv` (Nitro), ML Kit and Skia are native modules. Work in a
**development build** instead.

| Command | What it does |
| --- | --- |
| `npm start` | Metro for the dev client (`expo start --dev-client`) |
| `npm run android` / `npm run ios` | Local native build + install (needs Android SDK / Xcode) |
| `npm run prebuild` | Generate `ios/` and `android/` when you need to inspect native config |
| `npx eas build --profile development --platform android` | Cloud dev build with an install QR code |

Bundle identifiers are `com.expensetracker.app` for both platforms — change them before submitting to a
store. [`eas.json`](./eas.json) defines three profiles: `development` (dev client, internal APK), `preview`
(internal APK) and `production` (store build with auto-incrementing versions).

First-time setup:

```bash
npx eas login
npx eas init                                  # links the project, writes extra.eas.projectId
npx eas build --profile development --platform android
```

`EXPO_PUBLIC_*` values are inlined at bundle time. Locally they come from `.env`; for cloud builds define
them as EAS environment variables for the matching `environment` in `eas.json` (`development`,
`preview`, `production`).

### Supabase go-live checklist

1. `supabase link --project-ref <ref>` then `supabase db push` (applies the migration and RLS policies).
2. Copy `.env.example` → `.env` and fill in the project URL and anon key.
3. Restart Metro, sign in from **Settings → Sign in**, and confirm the migration summary
   (uploaded / skipped / failed) — retries are idempotent on `client_id`.

## Local backend (no Docker, no Supabase account)

`npm run dev:backend` starts a throwaway backend so the real sign-in → migration path can be exercised
locally. It uses the PostgreSQL 18 binaries already on the machine:

| Piece | Where |
| --- | --- |
| Isolated cluster (trust auth) | `.dev/pgdata`, port **5433** — the system service on 5432 is untouched |
| Supabase-compatible API | `http://127.0.0.1:54321` (+ `http://<LAN-IP>:54321`) ([tools/dev-backend/server.mjs](./tools/dev-backend/server.mjs)) |
| Database + schema | `expense_dev`, every migration applied on boot (idempotent) |
| Demo account | `demo@expensetracker.dev` / `expense123` |

The API implements only what the app calls: GoTrue's `signup` / `token` / `logout` / `user` endpoints and a
PostgREST subset (`select`, `eq/gte/lte/ilike/is/not`, `order`, `limit`/`offset`/`Range`, `on_conflict`
upserts, `Prefer: return=representation`). Every request runs in a transaction with
`set local role authenticated` and `request.jwt.claim.sub`, so **the real RLS policies are enforced** — a
forged `user_id` comes back as HTTP 403.

`.env` already points at it. To go back to a hosted Supabase project, replace the two values there.

`GET /dev/summary` returns row counts per table, which is handy when checking a migration.

Overridable when the default ports are taken: `DEV_PG_PORT`, `DEV_PG_DATA`, `DEV_PG_LOG`, `DEV_DB_NAME`
(e.g. `$env:DEV_PG_PORT='5434'; $env:DEV_PG_DATA="$PWD\.dev\pgdata-e2e"; npm run dev:backend`).

To stop the cluster: `& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D .dev/pgdata stop` — never kill
the shell that started it, because the postmaster's children cannot re-initialise afterwards.
Deleting `.dev/` resets everything (it is gitignored).

## Styling with NativeWind v4

- `metro.config.js` wraps the Expo config with `withNativeWind`, compiling `src/global.css`.
- `babel.config.js` sets `jsxImportSource: 'nativewind'` + `nativewind/babel`.
- `tailwind.config.js` uses `presets: [require('nativewind/preset')]` and scans `./src/**/*.{ts,tsx}`.
- Import `@/global.css` once from the root layout (already wired through `src/constants/theme.ts`).
- `className` types come from `nativewind-env.d.ts`; keep it in `tsconfig.json`'s `include`.

## Offline-first guest store

Everything works before sign-in; nothing in this layer talks to the network.

| File | Purpose |
| --- | --- |
| [src/stores/expenseStore.ts](./src/stores/expenseStore.ts) | Zustand store persisted through `zustand/middleware` |
| [src/lib/storage.ts](./src/lib/storage.ts) | Native adapter — `react-native-mmkv` v4 (`createMMKV`), AsyncStorage fallback |
| [src/lib/storage.web.ts](./src/lib/storage.web.ts) | Web adapter — `localStorage` (memory fallback during SSR) |
| [src/stores/selectors.ts](./src/stores/selectors.ts) | Month summary, category totals, budget usage + hooks |

- **Actions:** `add/update/delete` for transactions, categories, payment sources, and budgets, plus
  `markSynced`, `getGuestSnapshot({ pendingOnly })`, `clearDeletions`, `mergeCloudSnapshot` and `resetAll`.
  Every mutation is synchronous and immediately persisted.
- **Defaults:** six categories and three payment sources (Cash, Bank Account, Credit Card) are seeded on first
  launch. The category ids match the server's shared defaults, so a guest "Food" maps onto the cloud default
  instead of creating a duplicate.
- **Sync flags:** transactions and budgets start `pending`; `markSynced` is called after
  `migrateGuestData()` succeeds, any later edit flips the row back to `pending`, and a sync only pushes rows
  that are still `pending`. Categories and payment sources carry no flag — the push matches them on
  `client_id` (or name + kind) and skips what already exists.
- **Invariants:** amounts must be positive, category names are unique per type, payment source names are
  unique, default categories cannot be deleted, and deleting a category or payment source detaches its
  transactions instead of destroying history.
- **Hydration:** `useExpenseStoreHydrated()` gates UI until persisted data is in memory.

`storage.ts` is the native implementation and `storage.web.ts` the web override (Metro resolves per
platform). MMKV is a Nitro module, so a client built before the dependency existed would throw while
`react-native-mmkv` is still being evaluated. The adapter therefore loads MMKV lazily and degrades in two
steps instead of crashing: **AsyncStorage** (still persistent, async hydration still gated by
`useExpenseStoreHydrated()`), then an in-memory map if no native storage exists at all. Rebuild the
development client to get MMKV back — Settings shows `Memory only` in the degraded case.

### Receipt OCR

| File | Purpose |
| --- | --- |
| [src/hooks/useReceiptOCR.ts](./src/hooks/useReceiptOCR.ts) | Permission, capture, OCR, parse, and state machine |
| [src/services/ocr/recognize.ts](./src/services/ocr/recognize.ts) | Native engine — `@react-native-ml-kit/text-recognition` |
| [src/services/ocr/recognize.web.ts](./src/services/ocr/recognize.web.ts) | Web engine — lazy `tesseract.js` worker |
| [src/utils/receiptParser.ts](./src/utils/receiptParser.ts) | Pure `parseReceiptText()` regex parser |

```tsx
const cameraRef = useRef<CameraView>(null);
const ocr = useReceiptOCR({
  cameraRef,
  onParsed: (parsed) => setDraft({ amount: parsed.amount ?? undefined, date: parsed.date ?? undefined }),
});

<CameraView ref={cameraRef} />;
// ocr.captureWithCamera() uses the in-app preview when cameraRef is mounted,
// otherwise it hands off to the system camera UI.
// ocr.pickFromLibrary() covers attachments and is the only path on web.
```

`parseReceiptText()` returns `{ merchant, amount, currency, date, suggestedCategory, confidence, warnings }`
and handles `$54.20`, `₹1,450.00`, `1.450,00 EUR`, ISO/EU/US dates, and textual months. Locale
matters in one place: ambiguous `02/03/2026` is read month-first only for USD receipts.

Web OCR downloads the tesseract language data from the jsDelivr CDN on first use; the worker is
cached and released via `ocr.dispose()`.

> **Risk:** `@react-native-ml-kit/text-recognition` is untested on the New Architecture (it ships a
> legacy `NativeModules` bridge module). It is excluded from the React Native Directory doctor check
> for that reason. Because the engine sits behind `recognizeText(uri)`, swapping it for a
> New-Arch-ready OCR package is a single-file change — verify it on a development build early.

## Screens & navigation

| Route | File | Contents |
| --- | --- | --- |
| `/` | [src/app/index.tsx](./src/app/index.tsx) | Redirects to the dashboard |
| `/dashboard` | [src/app/(main)/(tabs)/dashboard.tsx](./src/app/(main)/(tabs)/dashboard.tsx) | Account banner (guest vs. cloud sync), month switcher, balance/income/expense cards, 6-month chart, recent activity, add FAB |
| `/transactions` | [src/app/(main)/(tabs)/transactions.tsx](./src/app/(main)/(tabs)/transactions.tsx) | Full activity list (tab label "Activity") |
| `/budgets` | [src/app/(main)/(tabs)/budgets.tsx](./src/app/(main)/(tabs)/budgets.tsx) | Month-scoped budgets with progress bars and a set-budget sheet |
| `/settings` | [src/app/(main)/(tabs)/settings.tsx](./src/app/(main)/(tabs)/settings.tsx) | Account status, sync, export, clear local data |
| `/categories` | [src/app/(main)/categories.tsx](./src/app/(main)/categories.tsx) | Custom category management (pushed from Settings) |
| `/payment-sources` | [src/app/(main)/payment-sources.tsx](./src/app/(main)/payment-sources.tsx) | Banks, cards, wallets and cash the user pays from (pushed from Settings) |
| `/auth` | [src/app/(main)/auth.tsx](./src/app/(main)/auth.tsx) | Supabase sign in / sign up, then guest migration |

Every tab gates on `useExpenseStoreHydrated()`, so server-rendered web markup shows a spinner instead of a
zeroed dashboard that then jumps to real numbers.

### Chart

`AnalyticsChart` resolves per platform:

- **Native** — [analytics-chart.tsx](./src/components/dashboard/analytics-chart.tsx): Victory Native XL on
  `@shopify/react-native-skia`. Grouped bars, press-and-drag shows a month tooltip. No Skia font is loaded —
  month labels are RN `<Text>` — so the bundle carries no TTF.
- **Web** — [analytics-chart.web.tsx](./src/components/dashboard/analytics-chart.web.tsx): Recharts with a
  hover tooltip.

Skia needs a development build and adds roughly 1.6 MB to the native JS bundle.

### Transaction sheet (create, edit, delete)

[transaction-form-modal.tsx](./src/components/transactions/transaction-form-modal.tsx) is one controlled
sheet (`visible` / `onClose`) used for both creating and editing — pass `transaction` to edit, omit it to
create. It holds amount, type, category chips, date and description.

- The date field is a real picker: [date-field.tsx](./src/components/ui/date-field.tsx) opens the native
  calendar (`@react-native-community/datetimepicker`, inline on iOS, `display="calendar"` on Android) and
  [date-field.web.tsx](./src/components/ui/date-field.web.tsx) renders an `<input type="date">`. Today /
  Yesterday shortcuts sit underneath.
- **Paid with** lists the user's payment sources as chips — see below for how they are managed.
- Rows on the dashboard and the Activity tab are pressable and open the sheet prefilled.
- Editing flips the row back to `syncStatus: 'pending'`, so the next sync pushes the new values.
- In edit mode the footer swaps Cancel for **Delete**, which requires a second tap to confirm.
- Deletes leave a tombstone in the store (`deletions`) and are replayed to Postgres on the next sync, so a
  row deleted after signing in really disappears from the cloud.

Receipt prefill works two ways: a pre-parsed `ocrResult` prop, or **Scan receipt** inside the sheet (which
calls `useReceiptOCR().pickFromLibrary()`). Either path fills amount, date and merchant → description, and
maps the suggested category onto a real category — switching the type when the suggestion is an income
category such as "Salary". A banner marks the form as scan-filled so values are reviewed before saving;
invalid amounts or dates are rejected inline, and `transfer` hides categories.

### Payment sources (banks, cards, wallets)

A transaction records *where* the money came from, not just a fixed payment mode, because one user can have
two banks and three cards. Each source is a row the user owns:

```ts
interface PaymentSource {
  id: string;
  name: string;              // "HDFC Savings", "Amex Platinum", "Cash"
  kind: PaymentSourceKind;   // cash | bank | credit_card | debit_card | wallet | upi | other
  last4: string | null;      // optional, to tell two cards of one bank apart
}
```

- [payment-source-picker.tsx](./src/components/payments/payment-source-picker.tsx) is the chip row inside the
  transaction sheet, with an inline **+ New** form (name, kind, last 4) so a second card never interrupts
  recording an expense.
- [payment-sources.tsx](./src/app/(main)/payment-sources.tsx) is the management screen — every source with its
  usage count; [payment-source-form-modal.tsx](./src/components/payments/payment-source-form-modal.tsx) edits
  name, kind and last 4. Names are unique per device, case-insensitively.
- `Transaction.paymentSourceId` points at the source; `Transaction.paymentMethod` keeps the denormalised
  *kind* alongside it, so history stays readable after a source is deleted (`ON DELETE SET NULL` in Postgres,
  and the store nulls the reference locally). Deleting a source therefore never rewrites old amounts.
- A new device seeds **Cash / Bank Account / Credit Card**, which the first pull folds into the account's own
  sources by name instead of duplicating them (see `mergePaymentSources`).
- [payment-options.ts](./src/constants/payment-options.ts) holds the kind list (label + emoji glyph) and the
  seed rows.

### Categories & budgets

- [budget-progress-row.tsx](./src/components/budgets/budget-progress-row.tsx) — bar turns sky below 80%,
  amber at ≥ 80% and red at ≥ 100%, with an 80% marker and the remaining/over amount spelled out.
- [set-budget-modal.tsx](./src/components/budgets/set-budget-modal.tsx) — upserts on the same natural key
  the database uses, `(user_id, category_id, month_year)`, so re-saving updates instead of duplicating.
- [category-form-modal.tsx](./src/components/categories/category-form-modal.tsx) — name, income/expense
  toggle, 11 colour swatches, 14 icons, delete behind a second tap. Icons are stored as names
  (`utensils`, `car`, …) and rendered from a glyph map in
  [category-options.ts](./src/constants/category-options.ts), so no icon font ships.

### Account, sync & export

- [auth.tsx](./src/app/(main)/auth.tsx) — sign in / sign up, email-confirmation state, and a post-sign-in
  migration phase that reports uploaded / skipped / failed.
- [settings.tsx](./src/app/(main)/(tabs)/settings.tsx) — account status, **Sync now**, sign out, storage
  mode, CSV export and a two-step clear (no `Alert`, because RN-web's `Alert` is a no-op).
- [syncService.ts](./src/services/syncService.ts) — the two-way sync, in five steps: adopt cloud rows that
  were created outside the app, replay local tombstones, **pull and merge**, push only the rows that are
  still dirty, then mark the ones that landed as `synced`. Pulling before pushing is what stops a freshly
  signed-in device from re-uploading its seeded categories and payment sources as new rows. Returns
  `{ uploaded, skipped, failed, deleted, deleteFailures, pulled }`; failures stay `pending` so the next run
  retries them.
- [pullService.ts](./src/services/pullService.ts) — reads the signed-in user's categories, payment sources,
  transactions and budgets. A project that has not run the payment-sources migration yet degrades to an empty
  list instead of failing the whole sync.
- [cloudMerge.ts](./src/services/cloudMerge.ts) — the pure merge rules: a locally `pending` row wins,
  otherwise the cloud row wins, tombstones block resurrection, rows that only exist in the cloud are adopted
  under their `client_id`, and seeded payment sources are folded into the account's own rows by name.
- [exportTransactions.ts](./src/services/export/exportTransactions.ts) with
  [saveCsv.ts](./src/services/export/saveCsv.ts) / [saveCsv.web.ts](./src/services/export/saveCsv.web.ts) —
  native writes into `Paths.cache` and opens the share sheet via `expo-sharing`; web triggers a Blob
  download. Both prepend a UTF-8 BOM so Excel decodes accents correctly. Columns:
  `Date, Type, Category, Amount, Currency, Description, Payment Source, Payment Method, From Receipt,
  Receipt, Created At` — the source is exported by name ("HDFC Savings") and the method by kind ("Bank").

## Supabase (optional cloud sync)

Guest mode is entirely on-device. The cloud only enters the picture when a guest signs up and
migrates their data.

1. Apply the schema to a Supabase project:

   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```

   The migrations are applied in filename order:

   | File | Adds |
   | --- | --- |
   | [`20261024120000_init_expensetracker.sql`](./supabase/migrations/20261024120000_init_expensetracker.sql) | `users`, `categories`, `transactions`, `budgets` + RLS on all four, and six shared default categories |
   | [`20261025120000_payment_sources.sql`](./supabase/migrations/20261025120000_payment_sources.sql) | `payment_sources` + `transactions.payment_source_id` + RLS |

   Both are idempotent, so re-running them (or booting the local dev backend) is safe.

2. Copy `.env.example` to `.env` and fill in the project URL and **anon** key. The anon key is
   safe to ship; `service_role` must never appear in the app bundle.

3. `src/lib/supabase.ts` builds the client lazily, so the app runs fine with no env at all —
   `isCloudConfigured` is the flag to gate cloud-only UI.

### Schema decisions

- `user_id` is `NOT NULL` on cloud rows. The SRS allows NULL for guest rows, but guest rows
  never leave the device, so an owner-less cloud row would be unreachable under RLS.
- `client_id` holds the device-local row id; `unique (user_id, client_id)` makes a retried
  guest migration idempotent. Budgets dedupe on their natural key
  `(user_id, category_id, month_year)` instead.
- `client_id` is also the upsert arbiter, so transactions are pushed **without** an `id` — sending both
  would collide on the primary key and turn an edit into a `409`. Rows created outside the app (imports,
  the SQL editor) get their `client_id` adopted on the next sync before anything is pushed.
- `payment_sources` is owner-scoped like `transactions`, and `transactions.payment_source_id` is
  `ON DELETE SET NULL`: deleting a bank keeps the spend and its `payment_method` kind.
- Upserts use `do update`, i.e. last write wins. Editing the same row on two devices concurrently keeps
  whichever synced last; there is no per-field merge.
- Policies use `(select auth.uid())` so the identity is evaluated once per statement.
- `anon` is revoked from every table — guests are local-only.

### Service layer

| File | Purpose |
| --- | --- |
| [src/lib/supabase.ts](./src/lib/supabase.ts) | Lazy client, session storage, `requireUserId()` |
| [src/types/database.types.ts](./src/types/database.types.ts) | Typed schema for the Supabase client |
| [src/services/transactionService.ts](./src/services/transactionService.ts) | `list`/`get`/`create`/`update`/`delete` + chunked idempotent `upsertTransactionsBatch` |
| [src/services/guestMigrationService.ts](./src/services/guestMigrationService.ts) | `migrateGuestData(snapshot)` — categories → payment sources → transactions → budgets, returns a per-stage report |
| [src/services/pullService.ts](./src/services/pullService.ts) | `fetchCloudSnapshot()` — the signed-in user's rows as camelCase DTOs |
| [src/services/cloudMerge.ts](./src/services/cloudMerge.ts) | Pure merge functions used by `mergeCloudSnapshot` in the store |
| [src/services/syncService.ts](./src/services/syncService.ts) | `syncLocalDataToCloud()` — adopt → delete replay → pull + merge → push dirty rows → mark |

`migrateGuestData` never throws on a bad row; invalid or unmapped records land in
`report.<stage>.failed` so the caller can decide to retry or drop them. Clear the local guest
store only when every stage reports no failures.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
