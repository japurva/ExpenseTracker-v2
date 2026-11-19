# Setup

Everything needed to go from a clean machine to a running app. For the local database detail see
[LOCAL-POSTGRES.md](./LOCAL-POSTGRES.md); for device builds see [RUN-ANDROID-IOS.md](./RUN-ANDROID-IOS.md).

---

## 1. Prerequisites

| Requirement | Needed for | Notes |
| --- | --- | --- |
| **Node.js 26** | everything | `package.json` has `engines.node >= 26.0.0`, `.nvmrc` pins `26` |
| **npm 11+** | installs | ships with Node 26 |
| **Git** | clone | |
| **PostgreSQL 18 binaries** | local backend | `initdb` / `pg_ctl` / `postgres`; no server, no Docker |
| **Android Studio + JDK 17** | Android | optional; only for local native builds |
| **Xcode + CocoaPods** | iOS | optional; **macOS only** |
| **EAS CLI** | cloud builds | optional; `npx eas-cli@latest` |

Install Node 26 and use the pinned version:

```bash
nvm install 26        # or: fnm install 26
nvm use               # reads .nvmrc
node -v               # v26.x
```

> If npm prints `EBADENGINE` on install, the active Node is older than 26. It is a warning, not a failure —
> the app still builds — but match 26 so local behaviour lines up with CI and EAS.

---

## 2. Install

```bash
cd ExpenseTracker-v2
npm install
```

Use `npx expo install <pkg>` for any **new** dependency, never `npm install <pkg>` — it resolves the version
that matches SDK 58.

---

## 3. Environment variables

Only two are required, both `EXPO_PUBLIC_*` (inlined into the client bundle at build time):

```bash
cp .env.example .env     # Windows: copy .env.example .env
```

| Variable | Local dev | Hosted Supabase |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | `https://<ref>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `dev-anon-key` | project anon key |

`.env` is gitignored and already points at the local backend. The anon key is safe to ship — Row Level
Security enforces access. **Never** put a `service_role` key in `.env`; it would end up in the bundle.

`src/lib/supabase.ts` builds the client lazily and `isCloudConfigured` gates cloud-only UI, so the app also
runs with no `.env` at all (guest mode only).

---

## 4. Start the local backend (Postgres + API)

```bash
npm run dev:backend
```

First run creates an isolated cluster in `.dev/pgdata` (port **5433**), creates the `expense_dev` database,
applies both migrations, and seeds a demo user. Then it serves a Supabase-compatible API on
<http://127.0.0.1:54321>.

| | |
| --- | --- |
| Demo account | `demo@expensetracker.dev` / `expense123` |
| Row counts | `curl http://127.0.0.1:54321/dev/summary` |
| Reset everything | stop it, then delete `.dev/` |

Leave this running in its own terminal. Details, env overrides and inspection commands:
[LOCAL-POSTGRES.md](./LOCAL-POSTGRES.md).

---

## 5. Start the app

```bash
npm start          # expo start --dev-client
```

Then press `a` (Android), `i` (iOS) or `w` (web) — or open the dev build already installed on a device and
point it at Metro. The first launch needs a development build; see
[RUN-ANDROID-IOS.md](./RUN-ANDROID-IOS.md).

Web only, no native build required:

```bash
npm run web
```

---

## 6. All setup commands, in one block

```bash
# 1. toolchain
nvm install 26 && nvm use

# 2. dependencies
cd ExpenseTracker-v2
npm install

# 3. env (already points at the local backend)
cp .env.example .env

# 4. backend — terminal A (PostgreSQL 18 on :5433 + API on :54321)
npm run dev:backend

# 5. app — terminal B
npm start                 # press a / i / w
# or a specific platform:
npm run android           # expo run:android (local native build)
npm run ios               # expo run:ios    (macOS only)
npm run web               # expo start --web

# 6. health
npm run typecheck
npm run doctor
npm run lint
```

---

## 7. Scripts

| Command | Expands to | Purpose |
| --- | --- | --- |
| `npm start` | `expo start --dev-client` | Metro for the development build |
| `npm run android` | `expo run:android` | Build + install + start on Android |
| `npm run ios` | `expo run:ios` | Build + install + start on iOS (macOS) |
| `npm run web` | `expo start --web` | Web dev server |
| `npm run dev:backend` | `node tools/dev-backend/server.mjs` | Local PostgreSQL + Supabase-compatible API |
| `npm run typecheck` | `tsc --noEmit` | Types |
| `npm run lint` | `expo lint` | ESLint (installs config on first run) |
| `npm run doctor` | `expo-doctor` | Dependency / config health |
| `npm run prebuild` | `expo prebuild` | Generate `ios/` and `android/` to inspect native config |

`ios/` and `android/` are generated (Continuous Native Generation) and gitignored — never edit them by hand;
change `app.json` or a config plugin instead.

---

## 8. Fixing a broken dependency tree

```bash
npx expo install --fix     # align every package with SDK 58
npx expo-doctor            # confirm 20/20
rm -rf node_modules package-lock.json && npm install   # last resort
```

---

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `EBADENGINE` on install | Node is < 26 — `nvm use` |
| Port 8081 in use | `npx expo start --port 8082` |
| Port 5433/54321 in use | `DEV_PG_PORT=5434 DEV_API_PORT=54322 npm run dev:backend`, then update `.env` |
| App shows "not configured" / guest only | `.env` missing or Metro started before it existed — restart `npm start` |
| Sign-in fails against the local backend | Backend not running, or the URL is wrong for the platform (see [RUN-ANDROID-IOS.md](./RUN-ANDROID-IOS.md#23-local-backend-url-for-android)) |
| `Native module ... not found` | You are on Expo Go — build a dev client |
| Metro cache weirdness | `npx expo start --clear` |
| `expo-doctor` flags a package | `npx expo install --fix` |

---

## Next

- [LOCAL-POSTGRES.md](./LOCAL-POSTGRES.md) — how the local database is wired up
- [RUN-ANDROID-IOS.md](./RUN-ANDROID-IOS.md) — emulate, device builds, EAS dev builds
- [DEPLOYMENT.md](./DEPLOYMENT.md) — production rollout
