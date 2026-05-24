---
'@pyreon/core': patch
---

Revert PR #855's `Symbol.for`-on-`globalThis` pattern in `@pyreon/core`'s 5 state files (`lifecycle.ts`, `component.ts`, `context.ts`, `telemetry.ts`, `props.ts`) — restore plain `let _foo = …` module-scope state (PR D of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

The new architecture (PRs A + B) makes this workaround unnecessary AND harmful:

- **Bundler prevents** (PR B = #884): `@pyreon/vite-plugin` injects `resolve.dedupe` for every `@pyreon/*` package — one instance per heap by construction.
- **Sentinel detects** (PR A = #883): every `@pyreon/*` package calls `registerSingleton(...)` at module load — anything that slips through prevention throws a fail-loud Error.

PR #855's Symbol.for pattern had real costs that the new architecture eliminates:

1. **Pollutes `globalThis`** with framework state symbols (visible to userspace, devtools, other libraries).
2. **Breaks SSR per-request isolation** — state is process-global, ALS-backed runtime-server has to do MORE work to compensate.
3. **Breaks test isolation** — `vi.resetModules()` doesn't reset `globalThis` state.
4. **No enforcement** — new contributors writing `let _foo = …` silently regressed the contract.

The `defineCrossModuleState` helper from #858 stays exported from `@pyreon/reactivity` and re-exported from `@pyreon/core` as a documented opt-in escape hatch for HMR state survival — it's no longer the framework contract.

`packages/core/core/src/tests/cross-module-state.test.ts` is deleted (asserted on `Symbol.for` keys that no longer exist).

**Ordering invariant** (per the plan): PR D MUST NOT merge until BOTH PR A (#883) and PR B (#884) are in `main` AND have been observed in canary for at least one week without incident. If a regression surfaces during canary, PR D simply doesn't ship — the γ workaround stays in `@pyreon/core` as a fallback while the regression is debugged.

Validation:
- `@pyreon/core` tests: 531 pass (was 538 — drop is the 7 deleted `cross-module-state.test.ts` specs that asserted on the now-removed Symbol.for keys)
- Full core-layer (`reactivity`, `core`, `router`, `runtime-dom`, `runtime-server`, `head`, `server`): 2,548 tests pass
- SSR per-request isolation via `runtime-server.setContextStackProvider()` preserved (function unchanged; just its underlying state moved from globalThis to module-scope)
