---
'@pyreon/runtime-dom': patch
'@pyreon/vite-plugin': patch
---

The default innerHTML sanitizer (~100-tag allowlists + walker) moves behind a tree-shakeable registration seam: `@pyreon/runtime-dom/sanitizer` registers it as a side effect, and `@pyreon/vite-plugin` auto-injects that import into any module whose source uses the sanitized `innerHTML` prop — Vite apps keep zero-config semantics while apps that never use it (most) drop the machinery entirely (mount-only import: 8,028 → 7,580 gz). Non-Vite consumers using `innerHTML` add the one-line import once; without any sanitizer registered, the sanitized path THROWS naming both fixes rather than ever applying unsanitized HTML (the security-critical direction — locked by a dedicated unregistered-state spec). `dangerouslySetInnerHTML` is raw by design (React semantics) and is unaffected; `setSanitizer(...)` custom sanitizers work without the default.
