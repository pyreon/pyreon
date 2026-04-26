---
"@pyreon/styler": patch
"@pyreon/coolgrid": patch
"@pyreon/attrs": patch
---

Fix dev-mode warnings being silently dropped in production browser bundles. Six files across three packages used `process.env.NODE_ENV !== 'production'` as a dev gate, which is dead code in real Vite browser bundles (Vite does not polyfill `process`). The most user-visible consequence: `@pyreon/styler` swallowed every `insertRule` failure with no console output — malformed CSS produced an empty `<style>` tag, classes assigned to elements, and zero diagnostic. Replaced with `import.meta.env?.DEV === true` via a local `__DEV__` const. The styler also gains a tree-shake regression test (`dev-gate-treeshake.test.ts`) that mirrors `runtime-dom`'s, bundling `sheet.ts` through Vite production and asserting the warn strings are eliminated.
