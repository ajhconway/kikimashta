# Offline practice (#223)

On Home, open the upper-left **Settings** button, review the download-size warning, then check **Enable offline practice** while connected. Keep the app open until it reports readiness. Downloads contain the selected language/packs, all available voices, approved contextual questions (including later unlocks and their answer pictures), plus the app, library shell, fonts and shared artwork. The displayed size includes the shared shell, roughly 10 MB. For example, Spanish Travel level 1 with all eight voices is about 39.6 MiB including the 10.2 MiB shared shell in the reviewed build; the app displays the current size. The checkbox remembers your choice. Additional selections require **Download selected packs** in Settings and reuse existing files; changing packs never starts a large download automatically.

Reopen the app without a connection to practice. A selection must be complete before Start is enabled offline. Change packs in the card library to return to a previously downloaded selection. Browsing other library items or using Dev review can request media outside the download; reconnect to download more packs if playback fails. New sign-in and downloads require a connection.

Answers and notes retain their existing device/account storage and stable IDs. Cached account identity only selects local history while offline; it never authorizes cloud access. Reconnection refreshes the session through the SDK and retries existing idempotent sync. Explicit sign-out keeps account history separate from guest history.

Unchecking **Enable offline practice** clears this app's media and shell caches across versions. It preserves practice history, notes and other preferences. A failed removal offers **Remove remaining downloads**. Browser storage eviction can also remove downloaded media; readiness is checked on opening Home, connection changes and window focus. Reconnect and download again after eviction, a quota failure or an interrupted download. Free browser storage when needed. A partial download can resume but is never reported complete.

Downloads belong to one build. Files are checked against the build's SHA-256 manifest before caching. Existing tabs keep their current version; updates wait for those tabs to close. When an update is available, close all app tabs and reopen while connected, then download the desired selection again. Old caches remain until explicitly removed, so updates can temporarily require extra storage. Removal affects other open tabs' offline availability too.

Only known same-origin static assets are cached. Auth, API requests and account data never enter the service worker cache. The worker supports byte-range media responses for Safari and caches both practice and vocabulary navigation entry points. Development mode has no service worker; use a production build and HTTPS (or localhost) to test.

Verification: `npm run check`, then build with the fake sync configuration in `docs/REVIEW.md` and run `npm run test:e2e`. `e2e/offline.spec.ts` exercises a native-audio offline lesson, reload/persistence and download removal; `e2e/sync.spec.ts` covers expired-session offline account reload and reconnect in Chromium. Its combined service-worker/fake-cloud test explicitly skips WebKit because controlled cross-origin requests bypass Playwright HTTP interception; the separate WebKit offline journey still exercises real downloads, playback and persistence. Other account tests retain Chromium/WebKit coverage. Worker tests cover incomplete/changed files, version mismatch, range responses, navigation, eviction and removal. The owner approved actual-iPhone offline lessons, reviews and reconnect synchronization in #223. The Settings UI (#241) still awaits owner visual approval before feature auto-merge.

## Public demo path (#234)

The demo is built for `/offline-demo/` and published alongside the ordinary root app. It has no additional access gate. `VITE_STORAGE_NAMESPACE=offline-demo` separates its device preferences, feedback, progress, notes and auth session from the root app. Explicit app sign-in still uses the real sync service and account history. The demo worker is registered only for `/offline-demo/`; download removal preserves root-site caches.

To verify the deployment build locally:

```sh
VITE_BASE_PATH=/offline-demo/ VITE_STORAGE_NAMESPACE=offline-demo npm run build
VITE_BASE_PATH=/offline-demo/ VITE_STORAGE_NAMESPACE=offline-demo npm run test:e2e -- --config=playwright.demo.config.ts
```

The dedicated browser fixture serves the exact built demo alongside a real root service worker. It exercises offline playback, saved answers, library navigation and separation from root device data and caches in Chromium and mobile WebKit. Ordinary root builds and storage keys remain unchanged. The Pages workflow pins the demo's reviewed source SHA independently of the root release; updating the demo requires updating that pin.
