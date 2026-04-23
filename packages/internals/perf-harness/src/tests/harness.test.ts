import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _count, _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  _disable()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

describe('perfHarness', () => {
  it('snapshot + reset round-trip', () => {
    perfHarness.enable()
    _count('x')
    _count('x')
    expect(perfHarness.snapshot()).toEqual({ x: 2 })
    perfHarness.reset()
    expect(perfHarness.snapshot()).toEqual({})
  })

  it('diff and formatDiff are exposed', () => {
    const d = perfHarness.diff({ a: 1 }, { a: 4 })
    expect(d.entries).toHaveLength(1)
    expect(perfHarness.formatDiff(d)).toContain('a')
  })

  it('record() isolates counter changes and restores prior state', async () => {
    perfHarness.enable()
    _count('outer', 10)
    const outcome = await perfHarness.record('scripted', () => {
      _count('inner', 3)
      return 'ok'
    })
    expect(outcome.label).toBe('scripted')
    expect(outcome.result).toBe('ok')
    expect(outcome.diff.entries.find((e) => e.name === 'inner')).toMatchObject({
      delta: 3,
      before: 0,
      after: 3,
    })
    // Outer state restored: outer still 10, inner cleared
    expect(perfHarness.snapshot()).toEqual({ outer: 10 })
  })

  it('record() restores the enabled flag when it was off going in', async () => {
    expect(perfHarness.isEnabled()).toBe(false)
    await perfHarness.record('journey', () => {
      _count('during')
    })
    expect(perfHarness.isEnabled()).toBe(false)
    // Counter writes are disabled again — this one goes nowhere
    _count('post')
    expect(perfHarness.snapshot()).toEqual({})
  })

  it('record() supports async functions', async () => {
    perfHarness.enable()
    const outcome = await perfHarness.record('async', async () => {
      await Promise.resolve()
      _count('tick')
      return 42
    })
    expect(outcome.result).toBe(42)
    expect(outcome.after).toEqual({ tick: 1 })
  })
})

describe('install / uninstall', () => {
  it('install() attaches to globalThis and enables counters', () => {
    const h = install()
    expect(h).toBe(perfHarness)
    expect((globalThis as unknown as Record<string, unknown>).__pyreon_perf__).toBe(
      perfHarness,
    )
    expect(perfHarness.isEnabled()).toBe(true)
  })

  it('uninstall() removes the global but does not disable counters', () => {
    install()
    uninstall()
    expect(
      (globalThis as unknown as Record<string, unknown>).__pyreon_perf__,
    ).toBeUndefined()
    expect(perfHarness.isEnabled()).toBe(true)
  })
})
