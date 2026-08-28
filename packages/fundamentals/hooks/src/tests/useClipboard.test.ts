import { effect } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useClipboard } from '../useClipboard'

const scopes: Array<{ dispose: () => void }> = []
function mountHook(options?: { timeout?: number }) {
  let r!: ReturnType<typeof useClipboard>
  const e = effect(() => {
    r = useClipboard(options)
  })
  scopes.push(e)
  return r
}

/** Replace `navigator.clipboard` with a writeText we control the timing of. */
function installClipboard(writeText: (v: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

/** A promise plus the handles to settle it later, so two copies can be interleaved. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('useClipboard', () => {
  afterEach(() => {
    for (const s of scopes.splice(0)) s.dispose()
    // biome-ignore lint: test teardown of a defineProperty'd global
    delete (navigator as unknown as Record<string, unknown>).clipboard
    vi.restoreAllMocks()
  })

  it('copies, and reports the copied text', async () => {
    installClipboard(() => Promise.resolve())
    const c = mountHook()
    await expect(c.copy('hello')).resolves.toBe(true)
    expect(c.text()).toBe('hello')
    expect(c.copied()).toBe(true)
  })

  it('reports failure when writeText rejects, and keeps copied false', async () => {
    installClipboard(() => Promise.reject(new Error('denied')))
    const c = mountHook()
    await expect(c.copy('nope')).resolves.toBe(false)
    expect(c.copied()).toBe(false)
  })

  it('returns false when the clipboard API is absent', async () => {
    // happy-dom DEFINES navigator.clipboard, and `delete` only removes an OWN
    // property -- so this has to override it with undefined rather than assume
    // a bare environment. Asserting after a `delete` here passed against the
    // harness, not the hook.
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })
    const c = mountHook()
    await expect(c.copy('x')).resolves.toBe(false)
  })

  // The guard this locks: `writeText` is async, so a SLOWER earlier copy can
  // resolve AFTER a faster later one. Without a generation check the older
  // value lands last and `text()` shows something the user did not copy last
  // -- leak class F (promise-queue stale resolution) in its state-clobbering
  // form. The fix shipped with no test, which is how the branch went uncovered.
  it('a slower EARLIER copy does not clobber a faster later one', async () => {
    const first = deferred()
    const second = deferred()
    const pending = new Map([
      ['first', first.promise],
      ['second', second.promise],
    ])
    installClipboard((v: string) => pending.get(v) ?? Promise.resolve())

    const c = mountHook()
    const a = c.copy('first')
    const b = c.copy('second')

    // The LATER copy wins the race and settles first.
    second.resolve()
    await expect(b).resolves.toBe(true)
    expect(c.text()).toBe('second')

    // Now the earlier, slower one settles. It must NOT overwrite the state --
    // it still reports success to ITS caller, because that copy did reach the
    // clipboard; it simply no longer owns the visible state.
    first.resolve()
    await expect(a).resolves.toBe(true)
    expect(c.text()).toBe('second')
  })
})
