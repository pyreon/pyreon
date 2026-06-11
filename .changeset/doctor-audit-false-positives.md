---
'@pyreon/compiler': patch
---

Fix two `pyreon doctor` audit detectors that produced false-positive ERRORS across the monorepo.

- **`auditContent` (content-audit gate) — per-config link scoping.** When two `content.config.*` files in one repo each declare a collection with the same name (e.g. the main `docs/` site and an `examples/*` mini-app both declaring a `docs` collection at `/docs`), the slug set was keyed globally by collection name, so the second config's (smaller) set OVERWROTE the first's — flagging every valid internal link in the larger app as broken (125 false `broken-internal-link` errors). Each config's pages now validate against ITS OWN collections; a link to another app's prefix is left alone.
- **`auditTestEnvironment` (audit-tests gate) — three mock-vnode false positives.** (1) `const vnode = (await Foo()) as T` (a real component's output) was miscounted as a mock-helper factory because the arrow heuristic matched any leading `(`; now it requires the `(…) =>` shape. (2) A `vnode()` mention inside a `//` or `/* */` comment was counted as a mock-helper call; the scanner now masks comments (and template-literal interiors) while preserving regular-string contents so import-path detection is unaffected. (3) `jsx()` / `jsxs()` (the automatic JSX runtime — the same vnode-producing machinery as `h()`) are now counted as real-runtime calls, so a test driving the real `jsx()` runtime is no longer misclassified as mock-only.

No public API change; the audits simply stop misfiring. Net effect on `pyreon doctor`: 129 → 0 errors monorepo-wide.
