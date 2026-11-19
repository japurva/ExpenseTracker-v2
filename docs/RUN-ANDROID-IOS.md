# Running on Android and iOS

All steps, in order, from a clean machine. Web is the quickest way to see the UI; native targets need a
**development build** because the app uses native modules.

---

## 0. Why not Expo Go

Expo Go only contains its own bundled modules. This app needs:

| Package | Why it blocks Expo Go |
| --- | --- |
| `react-native-mmkv` + `react-native-nitro-modules` | Nitro native module, no Expo Go build |
| `@react-native-ml-kit/text-recognition` | native OCR framework |
| `@shopify/react-native-skia` | native renderer for the chart |
| `@react-native-community/datetimepicker` | native date picker |
| `expo-camera`, `expo-image-picker`, `expo-sharing` | native permission + intent flows |

So: **development build** (`npx expo run:android` / `run:ios`, or `eas build --profile development`), then
`npm start` to attach Metro to it.

Bundle identifiers are `com.expensetracker.app` on both platforms — change them in [app.json](../app.json)
before shipping. `ios/` and `android/` are generated and gitignored; never edit them by hand.

---

## 1. Both platforms — shared steps

```bash
# Node 26
nvm install 26 && nvm use

# dependencies
npm install

# env (already points at the local backend)
cp .env.example .env          # Windows: copy .env.example .env

# backend in terminal A — do this first so .env is valid when Metro starts
npm run dev:backend
```

Keep the backend running. If you would rather use hosted Supabase, put the project URL and anon key in
`.env` instead — everything else is identical.

---

## 2. Android

### 2.1 Prerequisites

| Item | Detail |
| --- | --- |
| **JDK 17** | bundled with Android Studio, or install separately (Temurin 17) |
| **Android Studio** | includes the SDK manager, emulator and `adb` |
| **SDK Platform + Build-Tools** | SDK 36 / Build-Tools 36 for RN 0.88; take whatever Android Studio offers if newer |
| **An AVD or a physical phone** | physical device needs USB debugging enabled |
| **`ANDROID_HOME`** | must point at the SDK (see below) |

Environment variables (Windows — set once, then reopen the terminal):

```powershell
[Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
[Environment]::SetEnvironmentVariable('JAVA_HOME',   "C:\Program Files\Android\Android Studio\jbr", 'User')
```

macOS / Linux:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"   # Linux: $HOME/Android/Sdk
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Verify:

```bash
echo $env:ANDROID_HOME      # Windows
adb --version
java -version               # 17.x
```

### 2.2 Create and start an emulator

**Android Studio UI:** *More Actions → Virtual Device Manager → Create Device* → e.g. Pixel 8, system image
API 36 → Finish → ▶ to boot it.

**Command line:**

```bash
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
           "system-images;android-36;google_apis;x86_64"
avdmanager create avd -n expensetracker -k "system-images;android-36;google_apis;x86_64" -d pixel_8
emulator -avd expensetracker
```

Confirm the device is visible before building:

```bash
adb devices
# emulator-5554   device
```

### 2.3 Local backend URL for Android

`127.0.0.1` in `.env` is correct for every target: the app rewrites it to the host Metro is served from.
Just start the backend and Metro on the LAN (the default).

| Setup | `.env` | Extra step |
| --- | --- | --- |
| **Emulator** | `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` | none — LAN mode gives the emulator the host's LAN IP |
| **Emulator with `expo start --localhost`** | `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` | `adb reverse tcp:54321 tcp:54321` |
| **Physical device, Wi-Fi** | `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` | none — same Wi-Fi as the PC, allow `node.exe` through the firewall |
| **Hosted Supabase** | the project URL | none |

`Failed to connect to /127.0.0.1:54321` means the phone tried its own loopback: the rewrite found no LAN
host (tunnel mode), the backend is not running, or the firewall blocks port 54321. See
[LOCAL-POSTGRES.md § 8](./LOCAL-POSTGRES.md#8-reaching-the-local-api-from-a-device).

Restart Metro after editing `.env` — `EXPO_PUBLIC_*` is inlined at bundle time.

### 2.4 Build and run

First build compiles the native project (Gradle downloads dependencies; expect 5–15 minutes):

```bash
npm run android          # = npx expo run:android
```

Useful variants:

```bash
npx expo run:android --device                          # pick from connected devices
npx expo run:android --variant release                 # release build, no dev client
npx expo run:android --no-build-cache                  # after odd Gradle failures
```

After the app is installed, day-to-day work is just the dev server:

```bash
npm start                # then press "a"
```

### 2.5 Verify the Android build

- [ ] App opens on the dashboard with the **Guest mode** banner
- [ ] Add a transaction with a payment source → row appears, balance updates
- [ ] Tap the row → edit sheet opens, calendar picker works
- [ ] Budgets tab → set a budget, bar colours at 80% / 100%
- [ ] **Scan receipt** uses ML Kit and prefills amount / date / merchant
- [ ] Settings → Sign in with `demo@expensetracker.dev` / `expense123` → migration summary appears
- [ ] Settings → Sync now → "Uploaded … · pulled …"
- [ ] Settings → Export transactions (CSV) → Android share sheet opens

### 2.6 Android troubleshooting

| Symptom | Fix |
| --- | --- |
| `Failed to resolve the Android SDK path` | `ANDROID_HOME` unset — set it and reopen the terminal |
| `adb: no devices/emulators found` | boot the AVD first, or `adb kill-server && adb start-server` |
| `SDK location not found` | `npx expo run:android` normally writes `android/local.properties`; ensure `ANDROID_HOME` is set, delete `android/` and retry |
| Gradle out-of-memory | add `org.gradle.jvmargs=-Xmx4g` to `android/gradle.properties` |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | `adb uninstall com.expensetracker.app` then rebuild |
| Sign-in fails with `Failed to connect to /127.0.0.1:54321` | backend not running (`npm run dev:backend`), Metro started with `--tunnel`, or the firewall blocks port 54321 |
| Blank screen after a Metro restart | reload the app (`r` in Metro, or `adb shell input keyevent 82` → Reload) |
| Camera/photo permission denied | re-grant in Android Settings → Apps → ExpenseTracker → Permissions |
| Log warns `[storage] MMKV unavailable — falling back to AsyncStorage` | the installed client was built before `react-native-mmkv` was added — rebuild it (`npx expo run:android`); the app keeps working on AsyncStorage meanwhile |

---

## 3. iOS

> **macOS only.** On Windows you cannot build or run iOS locally — use the EAS path in section 4.

### 3.1 Prerequisites

| Item | Detail |
| --- | --- |
| **macOS** | latest stable |
| **Xcode** | latest stable from the App Store (16+ required by SDK 58) |
| **Command line tools** | `xcode-select --install`, then accept the licence |
| **CocoaPods** | `brew install cocoapods` (Homebrew) |
| **Simulator runtime** | Xcode → Settings → Components → install an iOS runtime |

One-time Xcode setup:

```bash
sudo xcodebuild -license accept
sudo xcodebuild -runFirstLaunch
xcodebuild -version          # Xcode 16.x or newer
pod --version
```

### 3.2 Pick a simulator

```bash
xcrun simctl list devices available | head -30
open -a Simulator            # boot the last used device
```

### 3.3 Local backend URL for iOS

`127.0.0.1` works as-is — the simulator shares the host network. Keep `.env` unchanged.

A **physical iPhone** on the same Wi-Fi also works: the loopback URL is rewritten to the Mac's LAN IP, the
same way as on Android.

### 3.4 Build and run

First build runs `pod install` and a full Xcode build (5–15 minutes):

```bash
npm run ios              # = npx expo run:ios
```

Variants:

```bash
npx expo run:ios --device                 # list and pick a physical device
npx expo run:ios --configuration Release  # release build
```

Day-to-day afterwards:

```bash
npm start                # then press "i"
```

### 3.5 Physical iPhone (local build)

1. Connect the device and trust the computer.
2. `npx expo run:ios --device`.
3. When Xcode complains about signing, open `ios/ExpenseTracker.xcworkspace`, select the target →
   *Signing & Capabilities* → choose your Team (a free Apple ID works — the profile expires after 7 days).
4. Trust the developer certificate on the phone: *Settings → General → VPN & Device Management*.
5. Re-run `npm start` and open the installed app.

### 3.6 Verify the iOS build

Same checklist as Android, plus:

- [ ] Inline iOS calendar appears when tapping the date field
- [ ] CSV export opens the iOS share sheet (Save to Files / Mail)
- [ ] Chart renders via Skia (Victory Native), not the web Recharts fallback
- [ ] Face ID / passcode prompt-free data access after a cold start (MMKV persistence survives relaunch)

### 3.7 iOS troubleshooting

| Symptom | Fix |
| --- | --- |
| `pod install` fails / stale pods | `cd ios && pod repo update && pod install`, or delete `ios/` and re-run `npx expo run:ios` |
| `sandbox: rsync … error` | known Xcode setting — `ios/` regenerate, or set `ENABLE_USER_SCRIPT_SANDBOXING = NO` (dev only) |
| Signing error `No profiles for 'com.expensetracker.app'` | select a Team in Xcode, or change the bundle id in `app.json` |
| Simulator runtime missing | Xcode → Settings → Components |
| Build succeeds, app shows red screen about a native module | you opened Expo Go instead of the dev build — `react-native-mmkv` itself only warns and falls back to AsyncStorage |
| `Unable to boot device` | `xcrun simctl shutdown all && open -a Simulator` |
| DerivedData weirdness | `rm -rf ~/Library/Developer/Xcode/DerivedData` and rebuild |
| Camera unavailable | the simulator has no camera — use **Scan receipt → pick from library** |

---

## 4. EAS development builds (works from Windows, incl. iOS)

Use this when you have no Mac, or want a build that other testers can install from a QR code.

```bash
# one-time
npx eas-cli@latest login
npx eas-cli@latest init                      # links the project, writes extra.eas.projectId

# dev clients (installable, internal distribution)
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios

# shareable test builds without the dev client
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile preview --platform ios
```

| Profile | `eas.json` settings | Use |
| --- | --- | --- |
| `development` | dev client, internal, **APK** | daily development |
| `preview` | internal, **APK** | QA / UAT without Metro |
| `production` | store build, auto-increment version | release |

Notes:

- **Android:** download the APK from the build page or scan the QR code, then `npm start` and press `a`.
- **iOS:** EAS registers the device UDID during the build wizard; install from the link on that device.
  Internal distribution needs a paid Apple Developer account.
- `EXPO_PUBLIC_*` values for cloud builds come from **EAS environment variables** per `environment` in
  `eas.json` (`development`, `preview`, `production`) — not from your local `.env`. Set them with
  `npx eas-cli@latest env:create`.
- Cloud builds are slow on the free tier; local `npm run android` / `npm run ios` is faster for iteration.

---

## 5. Web (fastest sanity check)

```bash
npm run web
```

No native build, but Skia/ML Kit are replaced by their web fallbacks (Recharts, tesseract.js) — so a web
pass does **not** prove the native OCR or chart code.

---

## 6. Quick reference

| Goal | Command |
| --- | --- |
| Start local DB + API | `npm run dev:backend` |
| Metro for the dev client | `npm start` |
| Build + install on Android | `npm run android` |
| Build + install on iOS | `npm run ios` |
| Run on web | `npm run web` |
| Regenerate native projects | `npm run prebuild` |
| Typecheck / lint / doctor | `npm run typecheck` · `npm run lint` · `npm run doctor` |
| Cloud dev build | `npx eas-cli@latest build --profile development --platform <android\|ios>` |

Next: [DEPLOYMENT.md](./DEPLOYMENT.md) for store releases.
