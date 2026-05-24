---
'@pyreon/reactivity': minor
'@pyreon/vite-plugin': patch
---

Phase 1α prototype of the cross-module-state architectural cleanup.

Two pieces:

1. **Singleton sentinel** in `@pyreon/reactivity` — registers a marker on globalThis at module load. A second load with a DIFFERENT module instance triggers fail-loud detection: throws by default (with an actionable error message naming both file locations and the fix), or `console.error`s under `PYREON_SINGLE_INSTANCE=warn`, or silent under `PYREON_SINGLE_INSTANCE=silent` (escape hatch for browser extensions / nested-Vite-SSR / micro-frontends).

2. **Opt-in dedupe** in `@pyreon/vite-plugin` — `pyreon({ dedupePyreon: true })` injects `resolve.dedupe: ['@pyreon/*']` into the Vite config, preventing the bundler from loading duplicate `@pyreon/*` instances in the first place.

Together these form Candidate α from the plan in `.claude/plans/jaunty-herding-kazoo.md`: prevention (dedup) + fail-loud backstop (sentinel). The default behavior is unchanged on this prototype — `dedupePyreon` defaults to `false` and the sentinel only matters when duplicate loading actually happens.

Empirical result: the dual-instance reproducer (`@pyreon/dual-instance-reproducer`) now THROWS instead of silently corrupting state when two `@pyreon/reactivity` instances are loaded in the same heap. 4/4 sentinel assertions pass.

This is one of three prototypes (α, β, ζ) being measured in parallel. The winner of Phase 2's empirical comparison becomes the default; the others get archived.
