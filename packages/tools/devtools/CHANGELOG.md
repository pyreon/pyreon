# @pyreon/devtools

## 0.1.1

### Patch Changes

- [#913](https://github.com/pyreon/pyreon/pull/913) [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(reactive-devtools): always-register in `__DEV__` so the Foundation surfaces a populated graph when devtools attaches AFTER mount

  Pre-fix, `_rdRegister` and `_rdRecordFire` early-returned on `!_active`. The opt-in design meant that signals/computeds/effects created BEFORE the devtools panel opened were never recorded — the live registry was empty by the time `activateReactiveDevtools()` fired. The Signals / Graph / Effects / Profiler tabs showed empty bodies against any real-world app (e.g. perf-dashboard's 958-element / 477-signal app, captured 0 / 0 / 0 / 0 in a controlled 4-scenario experiment).

  This change inverts the gating: `_rdRegister` and `_rdRecordFire` always run in `__DEV__` (the caller-side `process.env.NODE_ENV !== 'production'` gate is unchanged — production still tree-shakes the entire call chain to dead code). `_active` is now a READ gate: `getReactiveGraph()` / `getReactiveFires()` / `getFireSummaries()` return empty when no client has attached, so non-attached consumers see nothing even though the registry is populated.

  Behavioural changes:

  - A devtools panel opened AFTER the app mounts now sees the full live graph immediately on `activate()` — matches user expectation and fixes the empty-tabs UX.
  - `deactivateReactiveDevtools()` no longer clears the registry. The registry tracks the LIVE app state, which a subsequent `activate()` should still see (matches a "close + reopen panel" workflow). Clearing on deactivate would re-create the same bug at the close/reopen boundary.
  - Added `__resetReactiveDevtoolsForTesting()` (internal) for cross-test isolation. Production `deactivate()` only flips the read gate.
  - `_captureCallerLocation` stays gated on `_active` — stack parsing (~2.2µs/call) is the expensive part, and build-time-injected loc (via `@pyreon/vite-plugin`) is free and always-on, so most dev signals get loc anyway.

  Cost in `__DEV__`: a `Map.set` + `WeakRef` + `WeakMap.set` + `finalizer.register` per node (~hundreds of ns) and a counter bump + bounded ring-buffer append per fire (~ns). Production is unchanged (every entry point is dead-coded by the caller-side `NODE_ENV` gate).

  Companion change in `@pyreon/devtools`'s `scripts/verify-extension.ts`: the step-4 reactive-graph assertion is now a hard `fail()` instead of an informational `info()` line. This was the gap that allowed PR [#900](https://github.com/pyreon/pyreon/issues/900)'s first verification to pass while shipping a broken Foundation against real-world apps — closed by the same PR that fixes the underlying bug.

  Verified end-to-end with a 4-scenario controlled experiment against `examples/perf-dashboard` (958 components, 477 live signals/computeds/effects, 112 dependency edges):

  | Scenario                                 | Nodes | Edges | Fires | Components |
  | ---------------------------------------- | ----: | ----: | ----: | ---------: |
  | A. activate BEFORE mount                 |   477 |   112 |    16 |        958 |
  | B. activate AFTER mount (no interaction) |   477 |   112 |    16 |        958 |
  | C. activate AFTER mount + app activity   |   477 |   112 |    22 |        958 |
  | D. pre-activate (reload workaround)      |   477 |   112 |    16 |        958 |

  Pre-fix every scenario was `0 / 0 / 0`. Bisect-verified by reverting the `_active` early-returns: broken state reproduces `0 / 0 / 0` across all four scenarios; restoring brings them back to the post-fix numbers above.
