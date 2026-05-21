---
'@pyreon/vite-plugin': patch
---

**Critical SSR fix**: silences the `[Pyreon] onUnmount() called outside component setup` warning storm that fired on every dev-mode unmatched-URL hit in 0.24.4 (and likely earlier).

## Root cause

Vite's module resolver has TWO independent code paths for `@pyreon/*` package resolution:

| Vite path | Honors `bun` condition? | Resolves `@pyreon/core` to |
| --- | --- | --- |
| `[bare]` (user imports) | yes | `src/index.ts` |
| `[package entry]` (transitive lib imports) | no | `lib/index.js` |

Real-app symptom from a consumer report (bokisch.com): the SSR dev-404 chain produces **17 warnings** per `curl /unmatched` hit. Stack trace of the smoking gun (after the 0.24.2 captureCallSite skipPatterns fix surfaced it):

```
at onUnmount        (.../core/lib/index.js:68)       ← LIB
at provide          (.../core/lib/index.js:427)      ← LIB
at HeadProvider     (.../head/lib/provider.js:44)    ← LIB
at runWithHooks     (.../core/src/component.ts:34)   ← SRC ❗
at renderComponent  (.../runtime-server/lib/index.js:308)
```

TWO module instances of `@pyreon/core`:

1. **`runtime-server/lib`** resolves `@pyreon/core` → `src/component.ts` (Vite uses the `bun` condition for transitive deps under aliased packages — zero aliases runtime-server).
2. **`head/lib`** resolves `@pyreon/core` → `lib/index.js` (Vite's `[package entry]` path ignores the `bun` condition for some import chains).

The two instances each have their own `_current` lifecycle state. `runWithHooks` (in instance B) sets `_current` on B. `provide()` (in instance A) reads `_current` from A → null → fires the spurious warning.

## Fix

Add `ssr.noExternal: [/@pyreon\//]` to the plugin's `config()` return. This forces every framework package (and every user-side `@pyreon/*` import) through Vite's transform pipeline — single module instance per package, single `_current` state.

```ts
return {
  resolve: { conditions: ['bun'] },
  ssr: { noExternal: [/@pyreon\//] },   // ← new
  optimizeDeps: { exclude: ... },
  ...
}
```

Zero runtime behavior change — the fix reconciles Vite's module graph at config time.

## Verification

Tested against the real bokisch.com `migrate-to-pyreon` branch at commit `46f4b43` on 0.24.4:

| Configuration | warnings on `/xyzzy-404` (dev SSR) |
| --- | --- |
| 0.24.4 pre-fix (full bokisch tree) | **17** |
| 0.24.4 pre-fix (minimal `<PyreonUI><RouterView /></PyreonUI>` shape) | **8** |
| 0.24.4 + this fix (full bokisch tree) | **1** (residual is `useWindowResize` — separate bug class) |
| 0.24.4 + this fix (minimal shape) | **0** |

Bisect-verified: stashed the `ssr.noExternal` block → 2 regression specs in `ssr-no-external.test.ts` fail with `expected cfg.ssr to be defined`. Restored → 2/2 pass + all 175 existing vite-plugin tests pass.

## Diagnostic instrumentation used to find this

Three iterations of `process.stderr.write` injection into `node_modules/@pyreon/core/lib/index.js`:
1. Module-load tag (caught one module instance load)
2. `setCurrentHooks` + `runWithHooks` chronology trace (revealed setCurrentHooks NEVER fired on the warning-emitting instance)
3. Warning-emit site stack capture (revealed the cross-module `runWithHooks(.../src/component.ts:34) ← LIB` interleave)

Vite resolver debug log (`DEBUG=vite:resolve-details`) confirmed two distinct resolution strategies — `[bare]` → src/ and `[package entry]` → lib/.

## Not in scope

The 1 residual warning in the full-bokisch test is a separate bug: `useWindowResize` from `@pyreon/hooks` calls `onMount` from a code path that runs outside a setup window in some SSR scenario. Worth a follow-up but structurally unrelated to the module-instance duplication bug this PR fixes.

A defensive `Symbol.for('pyreon-core/lifecycle-state')` registry inside `@pyreon/core/src/lifecycle.ts` would harden against this class of bugs across ALL bundlers (Webpack/Next.js/Rolldown/etc., not just Vite). Documented as a follow-up — this PR is the smallest fix for the immediate Vite-specific regression.
