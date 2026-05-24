# @pyreon/dual-instance-reproducer

Workspace-internal package. **Not published.**

## Purpose

Empirical ground-truth for the dual-module-instance bug class.

When a `@pyreon/*` package is loaded **twice in the same JS heap** (Vite resolver divergence, sub-dep version mismatch, workspace + published mix, HMR re-eval), the framework's module-level state can be silently duplicated. Producers and consumers can land on different copies — breaking contracts silently.

This package contains:

1. **The contract tests** — small specs that assert what MUST be true when duplicate instances are loaded:
   - State unification: a signal write via instance A triggers an effect tracked via instance B.
   - No globalThis pollution: no `Symbol.for('pyreon-*-state')` keys leak onto `globalThis` from a normal load.
   - Test isolation: `vi.resetModules()` actually resets framework state between tests.

2. **The reproducer harness** — utilities that synthesize a dual-instance scenario inside a single Node process (via absolute-path dynamic imports).

3. **The regression gate** — CI runs the contract tests. Any candidate architecture (α, β, ζ, γ) must make them all pass.

## How it relates to the plan

This package is the **Phase 0 acceptance gate** for the architectural cleanup planned in `.claude/plans/jaunty-herding-kazoo.md`.

- Each prototype branch (α/β/ζ) must make these tests pass.
- The current main (with γ — `defineCrossModuleState` on globalThis) passes test #1 but is expected to fail tests #2 and #3.
- The chosen winner permanently locks these tests as a regression gate.

## Running

```sh
bun run --filter='@pyreon/dual-instance-reproducer' test
```
