/**
 * Regression lock: `@pyreon/vite-plugin` must set
 * `ssr.noExternal: [/@pyreon\//]` so every framework package goes through
 * Vite's transform pipeline. Without this, Vite externalizes some
 * `@pyreon/*` packages (loads via Node's `import()`) while transforming
 * others — producing TWO module instances of `@pyreon/core` (one at
 * `lib/index.js` via `import` condition, one at `src/index.ts` via the
 * `bun` condition). The two instances have SEPARATE `_current` lifecycle
 * state → `provide()` outside setup warning storm.
 *
 * Real-app symptom (bokisch.com dev-404 SSR, 0.24.4): 17 spurious
 * `[Pyreon] onUnmount() called outside component setup` warnings per
 * unmatched URL hit, even though every `provide()` IS structurally
 * inside a `runWithHooks` setup window.
 *
 * Reproduction trace (the differential):
 *   at onUnmount        (.../core/lib/index.js:68)       ← LIB
 *   at provide          (.../core/lib/index.js:427)      ← LIB
 *   at HeadProvider     (.../head/lib/provider.js:44)    ← LIB
 *   at runWithHooks     (.../core/src/component.ts:34)   ← SRC ❗
 *   at renderComponent  (.../runtime-server/lib/index.js:308)
 *
 * `head/lib` and `runtime-server/lib` resolve `@pyreon/core` via
 * different Vite paths — `head` lands at `lib/`, `runtime-server` lands
 * at `src/`. Two `_current` variables, two `setCurrentHooks` slots, the
 * one that gets set is NOT the one `provide()` reads from.
 *
 * Bisect-verified: removing `ssr.noExternal` from `vite-plugin`'s
 * `config()` return → bokisch reproduces 17 warnings on `/xyzzy-404`.
 * Restored → 1 (the residual is a separate `useWindowResize` bug class).
 */
import pyreon from '@pyreon/vite-plugin'
import { describe, expect, it } from 'vitest'

describe('@pyreon/vite-plugin — ssr.noExternal regression lock', () => {
  it('config() return includes ssr.noExternal matching @pyreon/* via regex', () => {
    const plugin = pyreon()
    const cfg = (plugin as { config: (u: unknown, e: unknown) => unknown }).config(
      { root: process.cwd() },
      { command: 'serve' as const, mode: 'development', isPreview: false, isSsrBuild: false },
    ) as { ssr?: { noExternal?: unknown } }

    expect(cfg.ssr).toBeDefined()
    expect(cfg.ssr?.noExternal).toBeDefined()
    expect(Array.isArray(cfg.ssr?.noExternal)).toBe(true)

    const arr = cfg.ssr?.noExternal as readonly (string | RegExp)[]
    expect(arr.length).toBeGreaterThan(0)

    // The regex must match every @pyreon/* package name. Without this,
    // Vite externalizes some packages and the module-instance duplication
    // bug returns.
    const matches = (name: string) =>
      arr.some((entry) => (entry instanceof RegExp ? entry.test(name) : entry === name))

    expect(matches('@pyreon/core'), '@pyreon/core must be noExternal').toBe(true)
    expect(matches('@pyreon/runtime-server'), '@pyreon/runtime-server must be noExternal').toBe(true)
    expect(matches('@pyreon/router'), '@pyreon/router must be noExternal').toBe(true)
    expect(matches('@pyreon/head'), '@pyreon/head must be noExternal').toBe(true)
    expect(matches('@pyreon/ui-core'), '@pyreon/ui-core must be noExternal').toBe(true)
    expect(matches('@pyreon/styler'), '@pyreon/styler must be noExternal').toBe(true)
    expect(matches('@pyreon/elements'), '@pyreon/elements must be noExternal').toBe(true)
    expect(matches('@pyreon/rocketstyle'), '@pyreon/rocketstyle must be noExternal').toBe(true)
    // Hypothetical third-party @pyreon package — the regex should match too.
    expect(matches('@pyreon/anything-new'), 'regex must match future packages').toBe(true)
  })

  it('regex does NOT match non-@pyreon packages', () => {
    const plugin = pyreon()
    const cfg = (plugin as { config: (u: unknown, e: unknown) => unknown }).config(
      { root: process.cwd() },
      { command: 'serve' as const, mode: 'development', isPreview: false, isSsrBuild: false },
    ) as { ssr?: { noExternal?: readonly (string | RegExp)[] } }
    const arr = cfg.ssr?.noExternal ?? []
    const matches = (name: string) =>
      arr.some((entry) => (entry instanceof RegExp ? entry.test(name) : entry === name))

    expect(matches('react'), 'react must not be noExternal').toBe(false)
    expect(matches('vite'), 'vite must not be noExternal').toBe(false)
    expect(matches('pyreon'), 'unscoped pyreon must not be noExternal').toBe(false)
  })
})
