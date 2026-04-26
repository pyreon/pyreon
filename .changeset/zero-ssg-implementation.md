---
"@pyreon/zero": minor
---

Implement static site generation for `mode: "ssg"`. Before this PR, `mode: "ssg"` and `ssg.paths` were typed in `types.ts` but had no runtime — the plugin had zero Rollup build hooks, so apps configured for SSG silently shipped a SPA shell with no per-route HTML. The new `ssgPlugin()` (auto-wired into `zeroPlugin()` when `mode === 'ssg'`) hooks `closeBundle`, runs a programmatic Vite SSR sub-build of a synthetic entry that imports `virtual:zero/routes` + zero's `createServer`, loads the resulting handler, and renders each path to `dist/<path>/index.html`.

`ssg.paths` accepts `string[]`, `() => string[]`, or `() => Promise<string[]>`. If neither is set, the plugin auto-detects static paths from the file-system route tree (anything without `:param` or `*` segments) and falls back to `/` if no static routes exist. Dynamic routes are skipped — Pyreon doesn't yet ship a `getStaticPaths`-style API to enumerate concrete values; pass them explicitly via `ssg.paths`.

**Internal API change**: `zeroPlugin()` now returns `Plugin[]` instead of `Plugin` — `[mainPlugin]` for non-SSG modes, `[mainPlugin, ssgPlugin]` for SSG. Vite's plugins array natively accepts nested arrays, so the user-facing `plugins: [pyreon(), zero()]` keeps working — but downstream code that assumed `zeroPlugin()` returned a single Plugin needs `.[0]` or array-aware access.
