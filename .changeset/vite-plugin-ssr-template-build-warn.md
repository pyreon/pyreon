---
"@pyreon/vite-plugin": patch
---

`vite build` now warns (once) when the `ssrTemplate` auto mode falls back to the slower `h()` SSR path because `@pyreon/runtime-server` is not resolvable from the app; it previously warned only in `vite dev`. Likewise, an opted-in `collapse` that cannot collapse any site (the resolver server fails to start, or `@pyreon/runtime-server`, `@pyreon/core`, `@pyreon/styler` or the configured provider/theme fail to load) now warns once instead of silently keeping the normal mount.
