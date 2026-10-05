# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Project map (read this instead of re-exploring the tree)

**Photocell** — Android/iOS gallery cleaner (Expo 57, RN 0.86, TS strict). App name in-app
is "FotoSil" (tr) / "Photocell" (en) via `dashboard.app_title`.

## Navigation
Single `App.tsx` owns all routing — there is no navigation library. It holds
`currentScreen: AppScreen` (tabs + `reviewer` + tool sub-screens) and renders via a switch in
`renderScreen()`. `BottomNavBar` is hidden for anything in `SUB_SCREENS`. Sub-screens get an
`onBack` prop and are wired into the Android hardware-back handler — **any new pushed screen
must be added to `SUB_SCREENS` and `SCREEN_ANALYTICS_NAME`, or it has no way back.**
Notification taps route through `openScreenFromNotification` (handles both tabs and tool
screens — `videos` is a tool screen, not a tab).

Tabs (`TabType`): `home | photos | timeline | tools | vault | report`.
Tool sub-screens (`ToolScreenType`): `photo_compressor | videos | exif_cleaner | heavy_media | contacts_cleaner`.

## Screens ↔ services
| Screen | Backing service |
|---|---|
| `HomeScreen` | `cacheCleaner` (lifetime stats), `mediaScanner` (permission status) |
| `DashboardScreen` | `mediaScanner.scanPhotos` — duplicates/similar/blurry/screenshots |
| `TimelineScreen` | `timelineScanner` — month groups + per-month review progress |
| `ReviewerScreen` | swipe/grouped review UI; reports reviewed ids back to `App.tsx` via `onFinish`, which persists timeline progress |
| `ToolsHubScreen` | pure nav hub, no data |
| `PhotoCompressorScreen` | `photoCompressor` |
| `VideoCompressorScreen` | `videoCompressor` |
| `ExifCleanerScreen` | `exifCleaner` — reads **real** GPS via `MediaLibrary.getAssetInfoAsync`, not filename heuristics |
| `HeavyMediaScreen` | ad-hoc `MediaLibrary` + `FileSystem` size scan, records into `cacheCleaner` split by photo/video |
| `ContactsCleanerScreen` | `contactsCleaner` |
| `VaultScreen` | `vaultService` — PIN-gated local photo vault |
| `ReportScreen` | `cacheCleaner.scanDeviceCache` — real app-cache directory scan, no invented numbers |
| `StorageHealthWidget` (on Home) | `deviceStorage.getStorageBreakdown` — real disk capacity + sampled media size |

`scanCacheService` is an in-memory cache (not disk) so tab switches are instant; call its
`invalidate*` methods after anything that changes the underlying data.

## Theme
Everything goes through `src/theme/colors.ts` — **no raw `rgba(...)` literals or hex codes in
screens.** Use `colors.*` tokens, `alpha(colors.x, 0.N)` for tinted fills/borders, `radius.*` for
corner radii. Palette is light "porcelain glass": violet primary, magenta accent, emerald/rose/amber
semantics. `colors.ts` also exports legacy aliases (`neonCyan`, `oledBlack`, etc.) kept only for
back-compat — don't write new code against them.

Shared layout primitives (use these instead of re-hand-rolling a header/card/empty-state):
- `components/layout/ScreenHeader.tsx` — every screen's top bar
- `components/layout/NavCard.tsx` — Home/Tools row cards
- `components/layout/FilterChips.tsx` — segmented filter rows
- `components/layout/EmptyState.tsx` / `LoadingState` — empty & loading placeholders
- `components/glass/GlassPanel.tsx` / `GlassButton.tsx` — the glass-panel look

## i18n
`src/i18n/locales/{tr,en}.json`, flat-ish nested keys, both files **must stay in sync** — every
key referenced in code must exist in both. There's a coverage checker used during past cleanup:
`ToolSearch`-free, ad-hoc `check_keys.py` scripts were written into the scratchpad and discarded;
recreate one if you add a batch of keys (walk `.ts(x)` for `t\('...'\)`, diff against both JSON
files' flattened keys). Don't use `t('key', 'fallback default')` — the fallback masks a missing
key; add the key to both locale files instead.

## Data-integrity rule (hard-won — see git history)
This app previously had **invented placeholder numbers everywhere** (fake lifetime-saved GB,
fake cache sizes, a storage-health widget with hardcoded percentages, GPS "detected" from
filename prefix, a fixed 2.5MB size guess for unmeasurable files). All of that was removed.
**Never reintroduce a hardcoded stat, percentage, or size as if it were measured data** — either
measure it for real (see `deviceStorage.ts` for the pattern: sample + extrapolate + expose an
`isEstimated` flag) or show nothing / an empty state.

## Photo scanning (`mediaScanner.ts`)
The gallery scan is **incremental**, not one blocking pass: `runFullScan()` processes the
newest photos first in batches of `SCAN_BATCH_SIZE` (500), caching and broadcasting a result
after *every* batch via `ScanPartialResultCallback` — not just at the end. This is why
`DashboardScreen` shows real content within seconds instead of waiting on the whole gallery,
with the rest streaming in quietly (`backgroundBatch` state / the "scanning in background"
pill). Duplicate/similar detection reuses a `fingerprintCache` Map across batches so an asset
fingerprinted once is never natively re-decoded, while still matching against everything seen
so far (so a burst that straddles a batch boundary isn't missed). If you touch this pipeline:
- `scanPhotos()` still resolves only when *every* batch is done, for simple `await` callers —
  always prefer passing `onPartialResult` for anything user-facing so the UI isn't stuck
  waiting on the full cap (`MAX_ASSETS_DEEP`/`MAX_ASSETS_QUICK`).
- **Never** check `ScanCacheService.getPhotoScan()` as a substitute for calling `scanPhotos()`
  — a cached result can be a partial batch from a scan that's still running. Always route
  through `scanPhotos()` (which internally joins an in-flight scan via `isPhotoScanInProgress()`
  before falling back to the cache), or a new caller will freeze on a stale partial forever.
- `computeRealTotalSize()` skips assets that already have `fileSize` set — don't reintroduce
  unconditional re-measurement, it's what keeps repeated batch calls cheap.

## Deleting media — the crash you will reintroduce if you're not careful
Every native deletion in the app **must** go through `deleteMediaAssets()` in `mediaScanner.ts`
— never call `MediaLibrary.deleteAssetsAsync` directly from a screen or another service. On
Android 11+, that call launches a system confirmation via an Activity Result contract
(`MediaStore.createDeleteRequest`); firing a second one before the first resolves crashes the
app natively (not a catchable JS rejection — this was the "uygulama patlıyor" bug). All six
former call sites (reviewer, Heavy Media, EXIF cleaning, the photo/video "replace original"
flows, the vault) now funnel through `deleteMediaAssets()`'s serialization queue. Relatedly,
`ReviewerScreen`'s `isProcessingRef` guard exists because its swipe gesture is memoized on
`[currentIndex, currentAsset]` — a closure that can go stale relative to `isProcessing` state,
letting a fast double-swipe fire two concurrent deletes for the same asset. If you add a new
delete-triggering interaction there, guard it with `isProcessingRef.current`, not the
`isProcessing` state variable.

## Notifications
`src/services/notificationService.ts`. Key invariants:
- `initializeNotifications()` must NOT unconditionally reschedule on every launch — it only
  schedules when nothing is currently queued (`getAllScheduledNotificationsAsync`). Rescheduling
  resets the interval timer, so calling this carelessly makes reminders never fire for regular
  users.
- `saveNotificationSettings()` only re-schedules when `enabled`/`frequency` actually changed.
- `sendTestNotification()` returns `'sent' | 'denied' | 'blocked' | 'error'` — always surface
  `'blocked'` with a way to open OS settings (`Linking.openSettings()`), since the OS won't
  re-prompt.
- The Settings test-notification button must stay visible regardless of the reminders toggle.

## Verification before calling anything done
No test suite exists. Verify with:
```bash
npx tsc --noEmit
npx expo export --platform android --output-dir .expo-export-check   # then rm -rf it
```
Both must be clean before you're done. Also grep for stray legacy colors before finishing a
screen: `grep -rn "0, 242, 254\|neonCyan\|electricPurple" src/`.

## First-run onboarding & permissions
`src/components/onboarding/OnboardingScreen.tsx` (2 steps: full gallery access, notifications) is
gated by `onboardingService` and rendered by `App.tsx`; notification init and scan prewarm only
run **after** onboarding. Limited photo access (`accessPrivileges: 'limited'`) counts as *not*
granted — the app can't scan or delete reliably with it. `requestFullMediaAccess()` in
`mediaScanner.ts` handles it. Unused permissions are blocked via `android.blockedPermissions` in
`app.json` (READ_MEDIA_AUDIO, SYSTEM_ALERT_WINDOW).

## Fullscreen / nav bar
Default is fullscreen (`isFullScreen` in `App.tsx` + `notificationService` settings); Android
buttons are hidden with `<NavigationBar hidden>` from `expo-navigation-bar`. `BottomNavBar` is a
floating animated bar with a bottom scrim; keep its `bottomOffset` logic when touching layout.

## Notifications (slot scheduling)
Reminders are fixed calendar slots (`REMINDER_SLOTS`, `slotIdentifier`) on channel
`photocell_reminders`, scheduled through a serialized `scheduleQueue`. Never schedule outside that
queue or with random identifiers — that is what produced two reminders firing at once.

## Compressors
Real sizes only (`assetSize.ts`: `measureAsset(s)`, `fetchLikelyHeaviest`, `discardTempFile`).
Compression results carry `isSmaller`; replace flows return `'replaced' | 'copy_only' | 'failed'`
and the UI must report them honestly (Android may deny the delete confirmation → `copy_only`).

## Perf rules
`GlassPanel` has no Skia/backdrop blur and flattens its fill to an opaque colour (translucent fill
+ elevation draws artifacts on Android). Skia is only used by `CircularGauge`. Don't add per-card
canvases.

## Dev environment gotchas
- `android/` is generated and gitignored; `expo prebuild --clean` wipes it. The release setup
  (signing config, keystore copy, R8/shrink flags, proguard rules, lint options) is re-applied by
  `plugins/withAndroidRelease.js`. Secrets come from the gitignored `keystore.properties` in the
  project root (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) or `PHOTOCELL_*` env vars;
  the keystore is read from `release-key.jks` in the project root. Proguard rules live in
  `plugins/android/proguard-rules.pro`. Version comes from `app.json` (`version`, `android.versionCode`).
  Verified: fresh prebuild + `gradlew :app:validateSigningRelease` passes.
- Windows JDK: Gradle "Unable to establish loopback connection" → set
  `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:/jtmp`.
- Git Bash mangles `/sdcard/...` for adb → `export MSYS_NO_PATHCONV=1`.

## SDK 57 library gotchas
- `expo-contacts`, `expo-media-library`, `expo-file-system` main entries are the new class-based
  APIs; the old function APIs throw "deprecated". Import `expo-contacts/legacy`,
  `expo-media-library/legacy`, `expo-file-system/legacy` (contacts did this wrong and the Contacts
  Cleaner never worked until fixed).
- Swipe/gesture worklets must never capture per-render async handlers (`runOnJS(handler)` of a stale
  closure aborted the app natively). Call a stable wrapper via `scheduleOnRN` from
  `react-native-worklets`, guard the callback with `finished`, and lock re-entry with a shared value.
- Destructive flows (compress/EXIF/contacts) must report outcomes honestly: `replaced | copy_only |
  failed`; never mark an item cleaned or say "safe" while the original still exists.
