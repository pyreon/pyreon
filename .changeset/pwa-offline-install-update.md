---
'@pyreon/zero': minor
---

Offline and installable apps: fix precached module chunks missing offline, and add the install and update helpers.

Fixed: a precached asset never matched a module-script request when the server sent `Vary: Origin` (`vite preview` and many CDNs do). The page loaded offline but its lazy route chunks failed with `ERR_FAILED`. The worker now matches precached files by URL (`ignoreVary`).

Added: `useInstallPrompt()` (`{ canInstall, prompt, isInstalled }`, one shared listener set), `useServiceWorkerUpdate()` (`{ updateReady, apply }`, works with or without `onUpdate`), `unregisterServiceWorkers()` for a stale worker on a dev origin, all from `@pyreon/zero` and `@pyreon/zero/client`. SPA builds now precache the app shell and answer every failed navigation with it, so any route loads offline. `pwa.offlineFallback` (SSG) names a prerendered page used as the shell for routes that were never prerendered or visited; it is a build error in the other modes.

Upgrade: none
