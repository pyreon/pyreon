---
"@pyreon/vite-plugin": minor
---

Add a dev throw-time fix printer (`pyreon({ devErrorPrinter })`, default-on in dev). When a component/effect throws in dev and the error message matches a known Pyreon foot-gun, its cause + fix + fix-code print to the console right at throw time. The plugin injects a DEV-ONLY inline `<script type="module">` (`virtual:pyreon/dev-error-printer`) that wires `@pyreon/core`'s `registerErrorHandler` → the browser-safe `@pyreon/compiler/diagnose` `diagnoseError`. Decoupled like HMR — the runtime never imports the compiler; production never injects the script (zero cost). Opt out with `devErrorPrinter: false`.
