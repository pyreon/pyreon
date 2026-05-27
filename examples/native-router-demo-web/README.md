# @pyreon/example-native-router-demo-web

> **PRIVATE / EXPERIMENTAL.** Web sibling of [`../native-router-demo-ios/`](../native-router-demo-ios/). Imports `RouterApp` from the iOS path directly — **ONE source, THREE targets.**

## What this proves

Phase R1's multiplatform routing story end-to-end on web via:

- `@pyreon/router` for runtime routing (createRouter, RouterProvider, RouterView, useNavigate)
- `@pyreon/primitives` for canonical UI vocabulary (Stack, Inline, Text, Button)
- `@pyreon/runtime-dom` for the DOM render
- `@pyreon/vite-plugin`'s JSX-auto-import for `<Stack>` / `<Inline>` / etc. bare references

The same RouterApp.tsx compiles to SwiftUI via PMTC + Compose via PMTC. The native targets see exactly this file via the canonical-primitive table; web sees it via Vite + the auto-import plugin.

## Run

```bash
cd examples/native-router-demo-web
bun run dev       # vite on http://localhost:5203
bun run build     # production bundle → dist/
bun run preview   # serve dist/ via vite preview
```

## Source structure

| File | Purpose |
|---|---|
| `index.html` | Bootstrap shell — mounts `#app` + loads `entry-client.tsx`. |
| `src/entry-client.tsx` | `@pyreon/runtime-dom` mount call; imports `RouterApp` from the iOS sibling. |

The actual `RouterApp.tsx` source lives at [`../native-router-demo-ios/src/RouterApp.tsx`](../native-router-demo-ios/src/RouterApp.tsx).

## Test plan

- **verify-modes** cell `native-router-demo-web × spa` (R1.5) — proves the production build emits expected content
- **Playwright e2e** (R1.4) — proves the runtime contract: initial render → click `<Link>` → URL updates → component renders → back-button works on all 3 targets
