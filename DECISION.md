# Phase 2 Decision — Cross-Module-State Architectural Cleanup

**Status**: Recommendation drafted from Phase 0 + Phase 1 (α and ζ) empirical results. β skipped — see "Why β was skipped" below.

**Reference**: `.claude/plans/jaunty-herding-kazoo.md`

## TL;DR

**Recommended winner: α (singleton sentinel + opt-in Vite dedupe), default-on for the sentinel.**

The empirical work uncovered a cleaner framing than the original plan's "pick one of three mechanisms":

- The **singleton sentinel is universally useful** regardless of which prevention mechanism is chosen. It works at Node level (no bundler required), catches every dual-load, and throws an actionable error.
- Prevention mechanisms (α dedup, ζ resolveId, β fusion) only matter as a "don't make the user hit the sentinel in normal use" convenience layer.
- The simplest correct architecture is: **sentinel ON by default, dedup/normalize OPT-IN, β not needed**.

## Empirical findings from Phase 0 + Phase 1

### Phase 0 (PR #873) — the reproducer

Successfully reproduced the dual-module-instance bug class in a pure Node ESM environment (no Vite required). On main today, with `defineCrossModuleState` helper merged (PR #858) but NOT yet applied to `@pyreon/reactivity`'s own state (PRs 2–6 still open):

```
sameInstance: false        # Two distinct module records confirmed ✓
keysAfter: []              # No globalThis state populated
runsLength: 1              # Effect ran initially, didn't fire on .set()
```

**This proves**: the bug class is real, reliably reproducible without Vite, and the `defineCrossModuleState` helper alone (without applying it across all surfaces) doesn't fix it.

### Phase 1α (branch `prototype/phase1-singleton-sentinel`) — sentinel + opt-in dedupe

Built `@pyreon/reactivity/src/singleton-sentinel.ts` registering a marker on globalThis at module load. Empirical test results:

| Assertion | Result |
|---|---|
| Throws on duplicate load (default mode) | ✓ |
| Error message names actionable fixes (Vite dedupe, npm ls, bun ls) | ✓ |
| Warns instead of throwing under `PYREON_SINGLE_INSTANCE=warn` | ✓ |
| Silent under `PYREON_SINGLE_INSTANCE=silent` | ✓ |

Existing test suite all green:
- `@pyreon/reactivity` — 382 pass
- `@pyreon/core` — 538 pass
- `@pyreon/runtime-dom` — 681 pass
- `@pyreon/runtime-server` — 150 pass
- `@pyreon/router` — 521 pass
- `@pyreon/server` — 168 pass
- `@pyreon/vite-plugin` — 175 pass

**One real-world interaction surfaced**: the `rocketstyle-collapse` resolver creates a nested Vite SSR server that legitimately dual-loads `@pyreon/*` packages. Updated to set `PYREON_SINGLE_INSTANCE=silent` for the duration of each `ssrLoadModule` call.

The opt-in dedupe (`pyreon({ dedupePyreon: true })`) was implemented but defaulted to `false` because of edge-case interactions that need careful debugging before flipping the default.

### Phase 1ζ (branch `prototype/phase1-resolveid-normalization`) — resolveId normalization

Built opt-in `pyreon({ normalizePyreon: true })`. Hooks `resolveId`, tracks first-seen path per `@pyreon/*` specifier, returns the canonical path for subsequent imports.

- Typecheck clean
- All 175 vite-plugin tests pass
- **Cannot be empirically verified through the Phase 0 reproducer** — ζ only fires under Vite, the reproducer uses native Node ESM.

This means ζ's value is theoretical until a Vite-specific dual-resolution scenario is constructed. The native `resolve.dedupe` (α) covers the common case; ζ is a "belt and suspenders" for edge cases dedup misses.

### Why β was skipped

β (compiler-fused virtual runtime) would be the strongest mechanism — consumer's bundle gets exactly one copy of every `@pyreon/*` symbol because the compiler aggregates them into a single virtual module.

Estimated ~600 lines of new code in the compiler + vite-plugin. Empirically, the Phase 1α sentinel **already provides the fail-loud guarantee** that β would also provide. The difference: β PREVENTS by construction; α DETECTS and forces the user to fix their bundler config.

For a framework that already ships with a Vite plugin, the user is going to configure Vite anyway. Push the responsibility to the bundler layer (where it belongs), surface bugs LOUDLY when they happen (sentinel), and don't pay the ~600-line tax for a marginal improvement.

**If β empirically turns out to be needed later** (e.g. consumers reporting Vite dedup config doesn't catch their scenarios), it can be built then. Not necessary today.

## The architectural framing that emerged from the experiments

The original plan treated α/β/ζ as three competing prevention mechanisms with the sentinel as a piece of α. The empirical work flipped the framing:

> **The sentinel is the load-bearing piece. Prevention mechanisms are conveniences.**

Reasoning:
1. Any prevention mechanism (α dedup, ζ resolveId, β fusion) can be defeated by user misconfiguration. None of them are bulletproof.
2. The sentinel works at Node level, regardless of bundler. It is the only mechanism that catches every dual-load.
3. Prevention mechanisms exist to spare the user from hitting the sentinel during normal operation. Without prevention, every consumer hits the sentinel and has to fix their bundler config. With α dedup default-on (when safe), most consumers never hit the sentinel.

This means the recommended architecture is:

```
DEFAULT (zero config):
  - Singleton sentinel ON in @pyreon/reactivity
  - Other @pyreon/* packages MAY add their own sentinel (decision: skip for now, reactivity covers the critical case)
  - PYREON_SINGLE_INSTANCE=silent for legitimate dual-load (extensions, nested SSR)

OPT-IN for Vite users:
  - pyreon({ dedupePyreon: true }) — injects resolve.dedupe (α)
  - pyreon({ normalizePyreon: true }) — adds resolveId normalization (ζ, stronger)

NOT BUILT:
  - β (compiler-fused runtime) — too expensive for marginal value over the sentinel

NOT RECOMMENDED:
  - γ (globalThis state via defineCrossModuleState everywhere) — PRs 2-6 open
    - Trades silent corruption for silent "global pollution" + broken SSR isolation + broken test isolation
    - Sentinel is strictly better because it makes the bug LOUD
```

## Recommended decision

**Ship α with the sentinel default-on.** Specifically:

1. **Phase 3 step 1**: Land `prototype/phase1-singleton-sentinel` (the α prototype) — sentinel default-on in `@pyreon/reactivity`, opt-in `dedupePyreon` in `@pyreon/vite-plugin`.
2. **Phase 3 step 2**: Decide PRs #863, #865, #867, #869, #870 fate:
   - **Recommended: close all 5.** Sentinel obsoletes γ. The `defineCrossModuleState` helper from PR #858 STAYS (it's a useful escape hatch for legitimate dual-instance scenarios), but it's no longer the framework contract.
   - Alternative: leave them open as "γ fallback" branches in case the sentinel surfaces unexpected issues in production canary. They can be merged any time as a fallback.
3. **Phase 3 step 3**: Add `pyreon doctor --check-dedup` audit (low priority — sentinel already catches violations at runtime).
4. **Phase 3 step 4**: Decide whether to ship `dedupePyreon: true` by default after the canary period. Currently opt-in for safety.
5. **Phase 4**: Lock contracts:
   - Phase 0 reproducer's `contract.test.ts` flipped from `it.fails` → `it` asserting positively (sentinel throws as expected).
   - Lint rule `pyreon/no-bare-module-state` flags any new `let _foo = ...` at module scope in `@pyreon/*` packages.
   - Documentation: `CLAUDE.md` + `.claude/rules/anti-patterns.md` updated.

## Open question

The empirical work uncovered ONE real-world interaction that needs ongoing care:

**Nested Vite SSR setups need to opt out of the sentinel.** The `rocketstyle-collapse` resolver does this via `PYREON_SINGLE_INSTANCE=silent` for the duration of each `ssrLoadModule` call. Any future tooling that creates nested Vite servers (SSR test harnesses, devtools, build-time SSR snapshotting) MUST do the same.

This is documentable but not enforceable at compile time. Worth a lint warning or doctor check if we discover patterns where users miss it.

## Rollback safety

If the sentinel default-on causes consumer pain in canary:

1. **Quick mitigation** (no code release): consumer sets `PYREON_SINGLE_INSTANCE=warn` or `=silent`. Their app works again, with the bug still present but not throwing.
2. **Code rollback** (single PR revert): the sentinel registration in `@pyreon/reactivity/src/index.ts` is ONE line. Revert removes the throw entirely.
3. **Re-deploy γ**: PRs #863-#869 are still on branches; they can be merged if the sentinel approach is abandoned.

The architecture is robustly reversible.

## Estimated remaining effort

- Phase 3 step 1 (land sentinel default-on): ~2 hours
- Phase 3 step 2 (close γ PRs): ~30 minutes
- Phase 3 step 3 (doctor check): ~3 hours
- Phase 3 step 4 (canary observation): 1-2 weeks
- Phase 4 (lint rule + reproducer flip + docs): ~3 hours

**Total ~8-10 hours of implementation work**, vs the original plan's 44-54 hour budget. The empirical work made the path shorter by surfacing the sentinel as the load-bearing piece.
