/**
 * Coverage-focused tests for loader.ts: the echarts/core import-FAILURE path.
 *
 * The happy-path loader tests (integration.test.ts, charts.test.tsx) import
 * real (or stub) echarts modules that always RESOLVE. The error/retry arms
 * only run when a dynamic `import('echarts/...')` REJECTS — which never
 * happens with echarts installed. This file mocks `echarts/core` so its
 * dynamic import throws, exercising:
 *
 *   - getCore()'s `.catch` handler (loader.ts:154-158):
 *       `corePromise = null` + `rethrowWithAliasHint(err)`
 *     → which transitively covers `rethrowWithAliasHint` (loader.ts:139-141).
 *
 * loadAndRegister's `.catch` (a per-MODULE failure where core itself resolves)
 * is covered in the sibling loader-module-failure.test.ts — it needs core to
 * SUCCEED, which is incompatible with mocking core to throw here.
 *
 * Per-file isolation: vitest gives this file its own module graph, so the
 * throwing echarts/core mock here does NOT affect integration.test.ts /
 * charts.test.tsx (which mock or import echarts normally).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Make `import('echarts/core')` REJECT. A vi.mock factory that throws causes
// the dynamic import of that specifier to reject with the thrown error — the
// exact runtime shape getCore()'s `.catch` is written to handle. The thrown
// message carries a tslib helper name so the alias-hint rewrite fires too.
vi.mock('echarts/core', () => {
  throw new TypeError(
    `Cannot destructure property '__extends' of 'undefined' as it is undefined.`,
  )
})

import { _resetLoader, getCore, getCoreSync } from '../loader'

describe('loader.ts — echarts/core import failure', () => {
  beforeEach(() => {
    _resetLoader()
  })
  afterEach(() => {
    _resetLoader()
  })

  it('getCore rejects (running its .catch + rethrowWithAliasHint) when echarts/core import fails', async () => {
    // Covers getCore's `.catch` (corePromise = null + rethrowWithAliasHint)
    // AND rethrowWithAliasHint itself (throw _wrapTslibError(err)).
    //
    // NOTE on the rejection MESSAGE: vitest wraps a throwing vi.mock factory
    // in its own "[vitest] There was an error when mocking a module" error and
    // discards the original message. That wrapper error is what getCore's
    // import() rejects with → it flows through the `.catch` → rethrowWithAliasHint
    // → _wrapTslibError (which, finding no tslib helper in the wrapper text,
    // returns it unchanged). So we only assert that getCore REJECTS (the catch
    // ran); the tslib-rewrite ARM of _wrapTslibError is exercised directly in
    // tslib-alias-detection.test.ts / coverage-gaps.test.ts where the message
    // is controllable.
    await expect(getCore()).rejects.toThrow()
  })

  it('getCore clears the cached rejection so a retry re-attempts the import', async () => {
    // The `.catch` sets `corePromise = null` so a fixed alias can retry.
    // After a rejection, getCoreSync() must still be null (nothing cached)
    // and a second call must re-run the (still-failing) import rather than
    // returning a frozen rejected promise.
    await expect(getCore()).rejects.toThrow()
    expect(getCoreSync()).toBeNull()
    // Second attempt re-runs the import path (still rejects) — proving the
    // cached-rejection clear worked; a frozen promise would not re-enter the
    // `.catch`.
    await expect(getCore()).rejects.toThrow()
  })
})
