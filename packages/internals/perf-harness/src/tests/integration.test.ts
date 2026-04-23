/**
 * Integration test — proves the globalThis sink pattern actually works end
 * to end. The harness installs, the styler's `resolve()` fires a counter
 * via `globalThis.__pyreon_count__`, the harness reads it back.
 *
 * This is the load-bearing regression test for the cross-package
 * instrumentation contract. If this fails, every instrumented metric in
 * every framework package is silently a no-op in dev.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolve } from '@pyreon/styler'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  _disable()
  uninstall()
})

afterEach(() => {
  _reset()
  _disable()
  uninstall()
})

describe('globalThis sink — end-to-end', () => {
  it('publishes __pyreon_count__ on install and styler emits to it', () => {
    install()
    // Tagged-template-style invocation of resolve().
    const strings = Object.assign(['color: ', ';'], { raw: ['color: ', ';'] })
    resolve(strings as unknown as TemplateStringsArray, ['red'], {})
    resolve(strings as unknown as TemplateStringsArray, ['blue'], {})

    const snap = perfHarness.snapshot()
    expect(snap['styler.resolve']).toBe(2)
  })

  it('clears __pyreon_count__ on disable — styler calls become no-ops', () => {
    install()
    perfHarness.disable()
    const strings = Object.assign(['x'], { raw: ['x'] })
    resolve(strings as unknown as TemplateStringsArray, [], {})
    expect(perfHarness.snapshot()).toEqual({})
  })

  it('records styler.resolve counters inside perfHarness.record()', async () => {
    const strings = Object.assign(['padding: ', 'px'], { raw: ['padding: ', 'px'] })
    const outcome = await perfHarness.record('resolve-twice', () => {
      resolve(strings as unknown as TemplateStringsArray, [8], {})
      resolve(strings as unknown as TemplateStringsArray, [16], {})
    })
    expect(outcome.after['styler.resolve']).toBe(2)
    expect(outcome.diff.entries.find((e) => e.name === 'styler.resolve')).toMatchObject({
      delta: 2,
      before: 0,
      after: 2,
    })
  })
})
