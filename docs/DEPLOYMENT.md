# Deployment Plan

Goal: ship ExpenseTracker to the App Store, Google Play, and the web, against a production Supabase
project — in phases that can each be verified before the next one starts.

Current state: the app builds and runs on all three platforms, `expo-doctor` is 20/20, and the full
guest → sign-in → sync flow is verified against a real PostgreSQL 18 instance. Three items below are
**release blockers** and are marked ⛔.

---

## Phase 0 — Accounts and decisions

| Item | Cost | Needed by |
| --- | --- | --- |
| Expo account + EAS project (`eas init`) | free tier OK | builds |
| Apple Developer Program | $99 / year | iOS internal distribution + App Store |
| Google Play Console | $25 one-time | Android release |
| Supabase project (Pro recommended) | $25 / month | production backend |
| Domain (optional) | ~$12 / year | web deployment, universal links |

Decisions to lock before Phase 3:

| Decision | Recommendation | Why |
| --- | --- | --- |
| Bundle identifiers | not `com.expensetracker.app` — use a real reverse-DNS you own | cannot change after the first store release |
| Versioning | keep `appVersionSource: "remote"` in [eas.json](../eas.json) | one source of truth for build numbers |
| Web output mode | keep `"server"` if deploying to EAS Hosting; switch to `"single"` for static CDN | determines the whole web deploy path (Phase 8) |
| OTA updates | adopt from v1.0 (Phase 9) | avoids forcing a store review for every copy tweak |

---

## Phase 1 — Production backend (Supabase)

**1.1 Create the project**, region close to users, save the database password in a password manager.

**1.2 Apply the schema** — both migrations, in order:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
# or paste supabase/migrations/*.sql into the SQL editor, in filename order
```

**1.3 Verify the schema and RLS** (do not skip — this is the security boundary):

```sql
-- five tables, RLS enabled on all of them
select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- expect: users, categories, transactions, payment_sources, budgets — all true

-- policies exist per table (15+ rows)
select tablename, count(*) from pg_policies where schemaname = 'public' group by 1;

-- six shared default categories
select count(*) from categories where is_default;
```

Then confirm isolation with a real client: sign up two users, add a transaction as A, and check it is
invisible to B. A forged insert (`user_id` = the other user) must fail with a policy error.

**1.4 Auth settings** (Supabase dashboard → Authentication):

| Setting | Value |
| --- | --- |
| Email confirmation | on for production (off makes signup instant, fine for QA) |
| Site URL | your web origin, or `expensetracker://` if web is not shipped |
| Redirect allow-list | `expensetracker://**`, `https://<web-domain>/**` |
| Leaked-password protection | on |
| Rate limits | defaults, tighten signup if abused |

**1.5 Backups** — enable daily backups (Pro), and note the PITR add-on decision. Test one restore into a
scratch project before launch; an untested backup is not a backup.

**1.6 Storage** ⛔ — `transactions.receipt_url` currently stores the **device-local file URI**, so a
receipt synced from a phone will not open on another device or on the web. Before launch either:

- create a private `receipts` bucket with per-user RLS, upload from
  [useReceiptOCR](../src/hooks/useReceiptOCR.ts) / the form, and store the object path; or
- accept local-only receipts and hide the receipt thumbnail for rows whose file is missing.

---

## Phase 2 — Environment and secrets

`EXPO_PUBLIC_*` values are **inlined into the client bundle**. They are not secrets — RLS is what protects
data. Never put a `service_role` key in any `EXPO_PUBLIC_*` variable.

Set them per EAS environment (matching `environment` in [eas.json](../eas.json)):

```bash
npx eas-cli@latest env:create --environment production \
  --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --visibility plaintext --scope project

npx eas-cli@latest env:create --environment production \
  --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon-key> --visibility sensitive --scope project

# repeat for --environment preview and --environment development
npx eas-cli@latest env:list --environment production
```

| Environment | Supabase target |
| --- | --- |
| `development` | local backend, or a shared dev project |
| `preview` | staging Supabase project (separate project — never the production database) |
| `production` | production project |

Rotate the anon key only together with a rebuild; old builds keep the old value.

---

## Phase 3 — App identity and assets

**3.1 Identifiers** in [app.json](../app.json):

```jsonc
{
  "expo": {
    "name": "ExpenseTracker",
    "slug": "expensetracker-v2",
    "scheme": "expensetracker",
    "ios":     { "bundleIdentifier": "com.<yourorg>.expensetracker" },
    "android": { "package":          "com.<yourorg>.expensetracker" }
  }
}
```

**3.2 iOS export compliance** — the app only uses standard HTTPS/crypto, so add this to avoid the
TestFlight compliance prompt on every build:

```jsonc
"ios": { "config": { "usesNonExemptEncryption": false } }
```

**3.3 Icons and splash** — final art in `assets/images` (icon 1024×1024 PNG, no alpha; Android adaptive
foreground/background/monochrome). Rebuild after changing them.

**3.4 Versioning** (`appVersionSource: "remote"`):

```bash
npx eas-cli@latest build:version:set --platform ios       # marketing version, e.g. 1.0.0
npx eas-cli@latest build:version:set --platform android
```

`production` has `autoIncrement: true`, so build numbers rise automatically; the marketing version is
yours to set.

**3.5 Permissions copy** — already in `app.json` (`expo-camera`, `expo-image-picker` strings). Review the
wording; store reviewers read it, and vague strings are a common rejection cause.

---

## Phase 4 — Build credentials

Let EAS own signing — it stores and reuses the keystore and certificates.

```bash
# Android keystore: generated on first build (or bring your own, needed if the app already exists)
npx eas-cli@latest credentials --platform android

# iOS: EAS creates the distribution certificate and provisioning profile on first build
npx eas-cli@latest credentials --platform ios
```

| Platform | Stored | Notes |
| --- | --- | --- |
| Android | keystore + alias + passwords | **losing it means you cannot update the app** — back it up |
| iOS | distribution cert, provisioning profile, push key if added later | needs an Apple Developer account registered with EAS |

---

## Phase 5 — Pre-release blockers ⛔

| # | Item | Why it blocks | Effort |
| --- | --- | --- | --- |
| 1 | **In-app account deletion** | App Store Guideline 5.1.1(v): if the app can create an account, it must delete it in-app. Google Play requires the same. Today Settings only has *Sign out* and *Clear local data* | ~1 day: `delete_my_account()` RPC (cascade) + a confirm flow in [settings.tsx](../src/app/(main)/(tabs)/settings.tsx) |
| 2 | **Receipt storage** (Phase 1.6) | cross-device receipts are broken as-is | ~1 day |
| 3 | **Store privacy answers** — App Privacy (iOS) and Data safety (Play) | must match reality: email, transaction amounts, receipt images, all tied to identity | ~2 h |

Also prepare:

- **Screenshots** — 6.9"/6.5" iPhone, 13" iPad only if you support iPad, Android phone + 7"/10" tablet
- **Listing copy** — name, subtitle, description, keywords, support URL, privacy policy URL (required)
- **Age rating** and **category** (Finance)
- **Countries** and pricing (free)

---

## Phase 6 — Internal testing

```bash
# Android testers / QA — installable APK, no Metro needed
npx eas-cli@latest build --profile preview --platform android

# iOS testers via TestFlight
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --profile production --platform ios --latest
```

Run the smoke list on a **real device** for each platform (emulator-only testing misses camera, share sheet
and MMKV persistence):

- [ ] Guest: add / edit / delete a transaction, all offline (airplane mode on)
- [ ] Offline edit survives an app restart
- [ ] Receipt OCR → prefilled form → save
- [ ] Budget bar colours at 80% and 100%
- [ ] Sign up → migration summary, rows land in Supabase
- [ ] Second device: sign in → the earlier transactions appear
- [ ] Edit on device A → sync → correct value on device B
- [ ] Delete on A → sync → gone on B
- [ ] Sign out → local data intact; clear local data → everything gone
- [ ] CSV export opens the share sheet / Files
- [ ] App works with the network down except for sync

---

## Phase 7 — Store submission

```bash
# final store build
npx eas-cli@latest build --profile production --platform all

# upload
npx eas-cli@latest submit --profile production --platform android
npx eas-cli@latest submit --profile production --platform ios
```

| Platform | Manual step that automation cannot do |
| --- | --- |
| Google Play | the **first** AAB must be uploaded through the Play Console UI (API cannot create the app); later uploads can use a service-account JSON key |
| Google Play | complete Data safety, content rating, target audience forms; then rollout |
| App Store | create the app record in App Connect, attach the build, fill *App Privacy*, submit for review |
| Both | staged rollout: 10% → 50% → 100%, watching crash-free sessions |

Review expectations: iOS 1–3 days typically; Play a few hours to a few days for a first submission.

---

## Phase 8 — Web

`app.json` sets `"web": { "output": "server" }`, so the web build needs a runtime with SSR support.

**Option A — EAS Hosting (recommended, keeps `output: "server"`)**

```bash
npx expo export --platform web     # → dist/
npx eas-cli@latest deploy          # deploys and prints a preview URL
```

Then promote an alias to production and attach a custom domain (EAS → Hosting → Deployments and aliases).

**Option B — static CDN (Netlify, Vercel static, S3+CloudFront)**

```jsonc
"web": { "output": "single" }   // client-only SPA, no server runtime
```

```bash
npx expo export --platform web
# upload dist/ ; rewrite all routes to /index.html
```

Either way: set the production Supabase URL for the web build, add the web origin to Supabase redirect
URLs, and verify sign-in plus sync in a browser. Web OCR uses tesseract.js, which downloads its language
data on first use — check it works on the deployed origin.

---

## Phase 9 — OTA updates

Not enabled yet (`expo-updates` is not installed). Add it once the store version is stable:

```bash
npx expo install expo-updates
```

```jsonc
// app.json
"runtimeVersion": { "policy": "fingerprint" }   // or "appVersion"
"updates": { "url": "https://u.expo.dev/<project-id>" }
```

```bash
npx eas-cli@latest update --branch production --message "Fix budget rounding"
```

Rule of thumb: JS-only fixes ship OTA; anything touching native modules, permissions or the runtime needs a
store build. `fingerprint` makes that automatic — a changed native fingerprint invalidates the update.

---

## Phase 10 — Observability and operations

| Concern | Action |
| --- | --- |
| Crash reporting | `npx expo install @sentry/react-native`, DSN per environment, source maps uploaded by EAS |
| Product analytics | optional; if added, update the privacy forms |
| Backend logs | Supabase → Logs (API, Postgres, Auth); watch 401/403 spikes (RLS or token issues) |
| Uptime | external check on the Supabase URL and, if web is live, the web origin |
| Backups | verify the Phase 1.5 restore once per quarter |
| Cost watch | Supabase row/bandwidth growth, EAS build minutes, hosting egress |

---

## Rollback playbook

| Failure | Response |
| --- | --- |
| Bad JS release via OTA | `npx eas-cli@latest update:republish` with the previous update, or `update:rollback` to the prior branch state; clients pick it up on next launch |
| Bad store build | halt the staged rollout in Play Console / *Remove from sale* on App Store; fix, bump, rebuild |
| Schema migration breaks queries | migrations are forward-only — ship a corrective migration immediately; keep old client versions working by never dropping columns a released app still reads |
| Backend outage | the app stays usable — it is offline-first; sync resumes and retries `pending` rows |
| RLS mistake | revoke the anon key impact by fixing the policy in a new migration, then confirm with the two-user test from Phase 1.3 |

---

## Timeline

| Phase | Duration | Gate to pass |
| --- | --- | --- |
| 0 Accounts | 1–3 days (Apple approval) | accounts active |
| 1 Backend | 0.5 day | RLS isolation verified with two real users |
| 2 Env/secrets | 1 h | `eas env:list` shows all three environments |
| 3 Identity/assets | 0.5 day | icons render on both platforms |
| 4 Credentials | 0.5 day | one successful internal build per platform |
| 5 Blockers | 2–3 days | account deletion + receipt strategy shipped |
| 6 Internal testing | 3–5 days | smoke list green on real devices |
| 7 Submission | 1–3 days per store | approved |
| 8 Web | 0.5 day | sign-in + sync work on the deployed origin |
| 9 OTA | 0.5 day | one update delivered to a preview build |
| 10 Ops | ongoing | crash-free ≥ 99% |

Realistic path to a first store release: **2–3 weeks** of part-time work, dominated by Phase 5 and review
latency.

---

## Release checklist (copy per release)

```
[ ] version set (eas build:version:set) and CHANGELOG updated
[ ] typecheck / lint / doctor green
[ ] local backend smoke test: guest CRUD, OCR, sync, CSV
[ ] production Supabase: migrations applied, RLS spot-check
[ ] EAS env vars correct for the target environment
[ ] production build succeeded for both platforms
[ ] TestFlight / internal track pass on real devices
[ ] store metadata + privacy forms current
[ ] staged rollout started (10%)
[ ] crash-free sessions and sync failure rate watched for 24 h
```
