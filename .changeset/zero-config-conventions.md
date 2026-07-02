---
'@pyreon/zero': minor
---

feat(zero): zero-config conventions — favicon file-detection + auto-injected theme script

**Favicon file convention.** Drop `src/favicon.svg` (or `.png`) in your project and zero generates the full favicon set (ICO + PNG sizes + web manifest + injected `<head>` tags) with defaults — no config, like Next's `app/icon.png`. Because the wiring is implicit, a missing `sharp` **soft-degrades to a one-time build warning** instead of the hard error explicit config keeps (you never explicitly asked, so an optional dependency must not fail your build). `zero({ favicon: false })` disables detection; explicit `zero({ favicon: { source } })` behaves exactly as before. `public/favicon.svg` is deliberately not detected (Vite copies `public/` verbatim — the generated file would collide).

**Auto-injected theme script.** `zero({ theme: true })` injects the pre-paint `themeScript` (dark/light from localStorage / `prefers-color-scheme`, applied before first paint) into every page's `<head>` — the manual `<script>{themeScript}</script>` step disappears. Injected content is byte-identical to `themeScript`, so `themeScriptCspHash` covers it under a strict CSP unchanged. Off by default (apps not using zero's theme system shouldn't pay for a localStorage read + `data-theme` write).
