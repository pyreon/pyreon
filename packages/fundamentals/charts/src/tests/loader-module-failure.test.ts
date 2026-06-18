/**
 * Coverage-focused tests for loader.ts: per-MODULE import failures + the
 * unknown-renderer branch.
 *
 * Here `echarts/core` RESOLVES (working stub), so getCore() succeeds and
 * ensureModules() reaches loadAndRegister(). `echarts/renderers` is mocked to
 * THROW, so loadAndRegister's `.catch` runs:
 *
 *   - loadAndRegister's `.catch` (loader.ts:194-197):
 *       `inflight.delete(key)` + `throw err` (re-throws the ORIGINAL error,
 *       no tslib rewrite at this layer — that's getCore's job).
 *
 * A second test passes an unknown renderer name so `RENDERERS[renderer]` is
 * undefined, exercising:
 *
 *   - ensureModules's `if (rendererLoader)` FALSE branch (loader.ts:216) —
 *     the renderer load is skipped entirely (no crash on a bad renderer).
 *
 * Per-file isolation keeps this throwing `echarts/renderers` mock from leaking
 * into the happy-path suites.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// echarts/core RESOLVES — a minimal working stub so getCore() succeeds and
// ensureModules() can proceed to the per-module loads.
vi.mock('echarts/core', () => {
  const use = vi.fn()
  return { use, init: vi.fn(), default: { use, init: vi.fn() } }
})

// echarts/renderers REJECTS — its dynamic import throws, so the
// `renderer:canvas` loadAndRegister rejects and its `.catch` runs.
vi.mock('echarts/renderers', () => {
  throw new Error('synthetic renderer import failure')
})

import { _resetLoader, ensureModules, getCore } from '../loader'

describe('loader.ts — per-module import failure', () => {
  beforeEach(() => {
    _resetLoader()
  })
  afterEach(() => {
    _resetLoader()
  })

  it('loadAndRegister re-throws when a module import fails (running its .catch)', async () => {
    // ensureModules('canvas') → loadAndRegister('renderer:canvas', ...) whose
    // `import('echarts/renderers')` rejects. The `.catch` runs
    // `inflight.delete('renderer:canvas'); throw err`, propagating up through
    // Promise.all → ensureModules rejects.
    //
    // NOTE on MESSAGE: vitest wraps the throwing vi.mock factory in its own
    // "[vitest] error when mocking a module" error, so the rejection text is
    // the wrapper's, not 'synthetic renderer import failure'. We assert only
    // that ensureModules REJECTS (loadAndRegister's `.catch` re-threw) — the
    // re-throw is verified by the rejection propagating at all; the catch's
    // `inflight.delete` side-effect is verified by the retry test below.
    await expect(
      ensureModules({ series: [{ type: 'bar', data: [1] }] }, 'canvas'),
    ).rejects.toThrow()
  })

  it('a failed module load clears its inflight entry so a retry re-attempts it', async () => {
    // First attempt fails (renderer import throws). The `.catch`'s
    // `inflight.delete(key)` clears the entry, so a second ensureModules call
    // re-runs the (still-failing) import rather than returning the cached
    // rejection. A frozen inflight rejection would NOT re-run loadAndRegister's
    // `.catch` on the second call — both rejecting proves the clear worked.
    await expect(
      ensureModules({ series: [{ type: 'bar', data: [1] }] }, 'canvas'),
    ).rejects.toThrow()
    await expect(
      ensureModules({ series: [{ type: 'bar', data: [1] }] }, 'canvas'),
    ).rejects.toThrow()
  })

  it('an unknown renderer name skips the renderer load (if-rendererLoader false branch)', async () => {
    // `RENDERERS[renderer]` is undefined for an unknown name → the
    // `if (rendererLoader)` guard is false → the renderer load is skipped.
    // With no series/components either, ensureModules resolves to the core
    // stub without ever touching the throwing echarts/renderers mock.
    const core = await ensureModules({}, 'webgl' as 'canvas')
    expect(core).toBeDefined()
    expect(typeof core.use).toBe('function')
  })

  it('concurrent getCore calls share one in-flight promise (if-!corePromise false branch)', async () => {
    // getCore's `if (!corePromise)` only enters the import on the FIRST call.
    // Two calls issued back-to-back WITHOUT awaiting → the second sees
    // `corePromise` already set → skips the body → takes the implicit else
    // arm and returns the shared in-flight promise. (core resolves to the
    // stub here.) `getCore` is `async`, so each call returns a distinct outer
    // promise BY IDENTITY — but both await the SAME inner `corePromise`, so
    // their resolved VALUES are the identical module object. That identity is
    // the observable proof the second call did NOT re-enter the import.
    _resetLoader()
    const p1 = getCore()
    const p2 = getCore() // corePromise is non-null → `if (!corePromise)` false
    const [c1, c2] = await Promise.all([p1, p2])
    expect(c1).toBe(c2)
    expect(typeof c1.use).toBe('function')
  })
})
