---
'@pyreon/core': patch
---

# Cross-module `@pyreon/core` duplication — fundamentally correct fix

**Fundamentally correct fix for the cross-module `@pyreon/core` duplication bug** that produced the dev-404 SSR `provide()` outside-setup warning storm reported in 0.24.4 (the same bug PR #850's `ssr.noExternal` papered over for Vite specifically). Same shape as `@pyreon/head`'s 0.21.0 → 0.22.0 collapse to one canonical module instance.

## Two-layer architecture

### Layer 1 — Root cause: strip `bun` + `src` from published packages (`scripts/publish.ts`)

The `bun` condition exists to point WORKSPACE consumers at TypeScript source (`./src/index.ts`) for HMR + fast refresh during framework development. It was never meant for published consumers. Vite's `[bare]` resolver honors `bun` (→ `src/`) while Vite's `[package entry]` resolver IGNORES it (→ `lib/`) — that's how the same `@pyreon/core` could resolve to two different files in one process. Every `provide()` outside-setup warning was that structural duplication.

`scripts/publish.ts` now performs TWO surgeries on every package's `package.json` BEFORE `npm publish` (Phase 2 already restores the workspace original after — no workspace impact):

1. **`exports`**: strip the `bun` condition from every entry + nested subpath. Published packages emit ONLY `import` + `types`, so consumers' bundlers have ONE canonical entry. **Single resolution path → single module instance.**
2. **`files`**: drop `src` from the array. Once `bun` is gone from exports, `src/` is unreachable through the package name — shipping it inside the tarball is pure waste (50KB-2MB per package × 53 framework packages ≈ multi-megabytes of dead weight per install). Tarball-only contains `lib/` + README + LICENSE post-strip.

Both helpers extracted to [`scripts/lib/strip-bun-condition.ts`](scripts/lib/strip-bun-condition.ts) — 11 unit specs lock the contract (recursive nested-condition handling, array preservation, primitive pass-through, multiple `src`-form variants, real `@pyreon/core` canonical-shape strip).

### Layer 2 — Defense-in-depth: `Symbol.for`-keyed shared state inside `@pyreon/core`

Even with Layer 1 eliminating the bug for npm consumers, workspace dev still uses the `bun` condition (correctly — that's the whole point of workspace dev). Layer 2 makes `@pyreon/core` defensive against ANY future module-duplication scenario by hosting all 5 module-level mutable state vars on `globalThis` under `Symbol.for` keys:

| File | State var | Symbol.for key |
| --- | --- | --- |
| `lifecycle.ts` | `_current` (lifecycle hooks) | `pyreon-core/lifecycle-state` |
| `component.ts` | `_errorBoundaryStack` | `pyreon-core/error-boundary-state` |
| `context.ts` | `_defaultStack` + `_stackProvider` | `pyreon-core/context-stack-state` |
| `telemetry.ts` | `_handlers` (error handlers) | `pyreon-core/error-handlers-state` |
| `props.ts` | `_idCounter` (createUniqueId) | `pyreon-core/id-counter-state` |

Same pattern as the existing `_bridgeHost = globalThis as PyreonErrorBridge` in `telemetry.ts:113` and `Symbol.for('pyreon:native-compat')` in `compat-marker.ts`. Both module instances reach the SAME state object via the Symbol.for lookup.

Pattern:

```ts
interface LifecycleState { current: LifecycleHooks | null }
const KEY = Symbol.for('pyreon-core/lifecycle-state')
const g = globalThis as Record<symbol, unknown>
const _state: LifecycleState = (g[KEY] as LifecycleState | undefined) ?? { current: null }
if (!g[KEY]) g[KEY] = _state
```

The `if (!g[KEY])` guard ensures the FIRST module instance creates the state; subsequent instances see it and use it.

## Why two layers is the fundamentally correct architecture

| Scenario | Layer 1 (strip) | Layer 2 (Symbol.for) |
| --- | --- | --- |
| Production npm consumer (Vite) | ✅ | ✅ |
| Production npm consumer (Webpack/Next.js/Rolldown/Parcel/Bun) | ✅ | ✅ |
| Workspace dev (Pyreon framework contributor) | ❌ (bun still active) | ✅ |
| Subdep version mismatch (different consumers have different versions vendored) | partial | ✅ |
| Future bundler resolver changes | partial | ✅ |
| Multiple Pyreon apps in same process (micro-frontends) | partial | ⚠️ shared state |

Layer 1 is the PRIMARY fix — it eliminates the bug class at the source for ~100% of npm consumers. Layer 2 is the safety net — catches workspace-dev cases + future scenarios Layer 1 doesn't reach.

**Known limitation (documented, accepted):** Layer 2 uses `globalThis` so multiple Pyreon apps in the same JS process (e.g. micro-frontends) would share state. This is not a supported scenario today; if it becomes one, the path forward is app-scoped contexts (separate architecture, deferred).

## Public API impact

**Zero.** Every existing public API (`setCurrentHooks` / `getCurrentHooks` / `onMount` / `onUnmount` / `onUpdate` / `onErrorCaptured` / `pushErrorBoundary` / `popErrorBoundary` / `dispatchToErrorBoundary` / `pushContext` / `popContext` / `useContext` / `setContextStackProvider` / `registerErrorHandler` / `reportError` / `createUniqueId` / `_resetIdCounter`) works identically. Only the state's STORAGE LOCATION changed.

Workspace dev workflow unchanged — `bun` condition still routes framework src/ imports to TypeScript source files. Only publish-time package.json is mutated (then restored).

## Verification

- **7 unit specs** for `stripBunCondition` covering recursive nesting, arrays, primitives, real `@pyreon/core` shape.
- **7 regression specs** for the Symbol.for state hosting in [`tests/cross-module-state.test.ts`](packages/core/core/src/tests/cross-module-state.test.ts):
  - Each state var reachable at its `Symbol.for` key on `globalThis`
  - Public APIs (`setCurrentHooks`, `pushContext`, `pushErrorBoundary`, `registerErrorHandler`, `createUniqueId`) all mutate the SHARED state object
  - "Scope invariant": simulating a second module instance via the same `Symbol.for` lookup returns the SAME state object (not a new one)
- **Bisect-verified**: stashed all 5 source-file Symbol.for changes → 7/7 cross-module-state specs fail with `expected undefined to be defined`. Restored → all pass + 531 existing core tests pass + downstream `router` / `head` / `runtime-dom` / `runtime-server` / `reactivity` clean.

## Relationship to PR #850

Complementary. PR #850 (`ssr.noExternal` in `@pyreon/vite-plugin`) is good Vite practice and fixed the immediate Vite consumer issue. This PR makes the framework structurally correct at the source — the bug class is eliminated regardless of bundler config.
