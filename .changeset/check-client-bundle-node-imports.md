---
---

CI hardening: gate against `node:*` imports leaking into client-safe published packages

PR #1125 first cut shipped a regression: `i18n-routing.ts` (exported from `@pyreon/zero`'s CLIENT-SAFE main entry) added a top-level `import { AsyncLocalStorage } from 'node:async_hooks'`. The browser couldn't resolve it, hydration broke, ssr-showcase e2e failed on `counter doesn't increment` + `theme toggle silent`. The root-cause fix split the ALS into a server-only module loaded lazily (PR #1125 follow-up); this PR adds a CI gate to prevent recurrence of the bug class.

**The gate** (`scripts/check-client-bundle-node-imports.ts`, wired into CI as `Check Client Bundle Node Imports`, required) walks every documented client-safe package's main-entry source transitively (following relative imports within the package) and fails if ANY reachable file has a `node:*` static import. Skips `import type` statements (TS-erased before bundling). Operates on TypeScript source — fast (no bundling), catches the bug at the same precision as a full bundle pass.

**`CLIENT_SAFE_PACKAGES` is the authoritative source.** Add a package only when its main-entry export is documented as client-safe. Server-only packages (`@pyreon/server`, `@pyreon/runtime-server`, `@pyreon/vite-plugin`, etc.) legitimately use `node:*` and must NOT be added. Initial set: `@pyreon/zero`.

**Anti-pattern documented** in `.claude/rules/anti-patterns.md` under Architecture Mistakes — the bug class, the two canonical fix shapes (server-only module + setter-pattern bridge, OR `/server` subpath split), and the prevention gate.

**Branch protection updated**: `Check Client Bundle Node Imports` added to required checks (23 → 24 required). Same PR also promoted `Diagnose Catalog` to required (was advisory).

Bisect-verified: injecting `import { AsyncLocalStorage } from 'node:async_hooks'` at the top of `i18n-routing.ts` makes the gate exit 1 with the exact diagnostic the PR-S7 first cut shipped without. Removing the injection restores exit 0.
