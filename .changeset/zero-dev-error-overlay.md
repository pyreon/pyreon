---
'@pyreon/zero': minor
'@pyreon/router': patch
'@pyreon/compiler': patch
---

Upgrade: none

Zero's development error overlay is redesigned and now shows real, actionable data. An SSR render error, a loader error or a middleware error answers 500 with a self-contained page (no app CSS, system fonts) that names what failed and where: a status chip (`Server render failed`, `Loader threw`, `Middleware threw`), the matched route and phase, the message, the first stack frame in your own code as a link with **Open in editor** (Vite's `/__open-in-editor`), that file's lines around the error with the failing line marked, the stack with framework and dependency frames dimmed, a **How to fix it** box filled from the diagnose catalog when an entry matches (left out otherwise), **Copy for your AI assistant** (the whole report as plain text) and **Reload**. Hydration mismatches the runtime reports now open the same overlay over the running page, with the server value, the client value and the DOM path. The overlay is a dialog (`role="alertdialog"`): focus moves to it and stays inside, Esc dismisses it and gives focus back, it follows the stored `zero-theme` preference or the OS colour scheme, respects reduced motion, and fits a 320 px viewport. Development only: the browser half loads through a module zero injects into dev-server pages (new internal subpath `@pyreon/zero/dev-overlay`), and none of it reaches a build.

`@pyreon/router`: in development, `router.preload` tags a loader's error with the route whose loader threw (a non-enumerable `Symbol.for('pyreon.router.loaderErrorRoute')` property) before rethrowing the same error, so a dev host can tell a loader failure from a render failure. Folded out of production builds.

`@pyreon/compiler`: the diagnose catalog answers `window is not defined` (and `document`, `localStorage`, `navigator` and other browser globals) with the server-rendering cause and the `onMount` / `isServer` fix. These messages used to reach the generic `X is not defined` entry, which explains a compiler scope leak and advised updating `@pyreon/compiler`.
