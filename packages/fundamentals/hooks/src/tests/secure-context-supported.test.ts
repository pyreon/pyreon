/**
 * Asking whether a gated API is available must be as informative as trying to
 * use it.
 *
 * The diagnostic was first wired only at the BAIL paths — the point where you
 * call `acquire()` / `start()` / `copy()`. But the idiomatic Pyreon shape is to
 * branch on the capability instead:
 *
 *     <Show when={() => lock.supported()} fallback={<Unsupported />}>
 *
 * An app written that way is CORRECT, degrades gracefully, and never reaches a
 * bail path — so it never learned that the only thing wrong was the origin.
 * That is the same silent dead end the diagnostic exists to remove.
 *
 * Safe to fire from an accessor because the warning is memoized per hook: a
 * `supported()` read inside a render loop still produces exactly one line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetSecureContextWarnings } from '../secure-context'
import { useWakeLock } from '../useWakeLock'

function setSecureContext(value: boolean): void {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true, writable: true })
}

describe('supported() on an insecure origin', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    __resetSecureContextWarnings()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
    setSecureContext(true)
  })

  it('explains itself to an app that only ASKS, never tries', () => {
    // happy-dom has no `navigator.wakeLock`, so `supported()` is false here for
    // the same reason it would be on a phone over plain HTTP.
    setSecureContext(false)
    const lock = useWakeLock()

    expect(lock.supported()).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('useWakeLock')
  })

  it('stays quiet on a secure origin — there the API is genuinely absent', () => {
    setSecureContext(true)
    const lock = useWakeLock()
    expect(lock.supported()).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns ONCE however many times the accessor is read', () => {
    // The realistic shape: `supported()` inside a reactive scope, re-read on
    // every render. One line, not one per frame.
    setSecureContext(false)
    const lock = useWakeLock()
    for (let i = 0; i < 25; i += 1) lock.supported()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
