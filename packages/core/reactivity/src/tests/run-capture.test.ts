import {
  _captureRun,
  _frameReads,
  _releaseRun,
  _replayReads,
  _sampleReads,
  effect,
  onCleanup,
  type RunCapture,
  signal,
  type SubscriberHost,
} from '../index'
import { runCollect } from '../tracking'

// The single-evaluation hand-off helpers (`mountAccessorChild` in
// runtime-dom evaluates an accessor child once, then gives the value, its
// reads and whatever it registered to the binding that owns it). These pin the
// contracts at the reactivity layer, independent of the DOM consumers.

const fresh = (): RunCapture => ({ inner: null, cleanups: null })

describe('_captureRun / _releaseRun', () => {
  test('records effects and onCleanups instead of registering them in the caller frame', () => {
    const log: string[] = []
    const s = signal(0)
    const run = fresh()
    const outer = effect(() => {
      _captureRun(() => {
        effect(() => {
          log.push(`inner ${s()}`)
        })
        onCleanup(() => log.push('cleanup'))
      }, run)
    })
    expect(run.inner).toHaveLength(1)
    expect(run.cleanups).toHaveLength(1)
    // Captured, not owned by `outer`: disposing it neither runs the cleanup
    // nor stops the inner effect.
    outer.dispose()
    expect(log).toEqual(['inner 0'])
    s.set(1)
    expect(log).toEqual(['inner 0', 'inner 1'])
    // Released into a new owner: that owner now disposes both.
    const owner = effect(() => {
      _releaseRun(run)
    })
    expect(run.inner).toBeNull()
    expect(run.cleanups).toBeNull()
    owner.dispose()
    expect(log).toEqual(['inner 0', 'inner 1', 'cleanup'])
    s.set(2)
    expect(log).toEqual(['inner 0', 'inner 1', 'cleanup'])
  })

  test('a run that registers nothing captures nothing', () => {
    const run = fresh()
    expect(_captureRun(() => 42, run)).toBe(42)
    expect(run).toEqual({ inner: null, cleanups: null })
    _releaseRun(run) // no-op
    expect(run).toEqual({ inner: null, cleanups: null })
  })

  test('a throwing run still records what it registered, and restores the frames', () => {
    const log: string[] = []
    const run = fresh()
    expect(() =>
      _captureRun(() => {
        onCleanup(() => log.push('cleanup'))
        throw new Error('boom')
      }, run),
    ).toThrow('boom')
    expect(run.cleanups).toHaveLength(1)
    // The caller frame is intact: an effect created now registers normally.
    const e = effect(() => {
      onCleanup(() => log.push('e cleanup'))
    })
    e.dispose()
    expect(log).toEqual(['e cleanup'])
    _releaseRun(run)
  })
})

describe('_frameReads / _replayReads / _sampleReads', () => {
  test('_frameReads is null outside a collect frame', () => {
    expect(_frameReads()).toBeNull()
  })

  test('_frameReads copies the reads the current collect frame recorded', () => {
    const a = signal(1)
    const b = signal(2)
    const deps: SubscriberHost[] = []
    let seen: SubscriberHost[] | null = null
    runCollect(
      () => {},
      deps,
      () => {
        a()
        b()
        seen = _frameReads()
      },
    )
    expect(seen).toHaveLength(2)
    expect(seen).not.toBe(deps)
    expect(seen).toEqual(deps)
  })

  test('_sampleReads returns the value and the reads, and leaves no subscription behind', () => {
    const a = signal(1)
    const b = signal(2)
    const reads: SubscriberHost[] = []
    expect(_sampleReads(() => a() + b(), reads)).toBe(3)
    expect(reads).toHaveLength(2)
    // Unsubscribed: writing the sources notifies nothing (and does not throw).
    a.set(10)
    b.set(20)
    expect(reads).toHaveLength(2)
  })

  test('_sampleReads unsubscribes even when the sampled code throws', () => {
    const a = signal(1)
    const reads: SubscriberHost[] = []
    expect(() =>
      _sampleReads(() => {
        a()
        throw new Error('boom')
      }, reads),
    ).toThrow('boom')
    expect(reads).toHaveLength(1)
    a.set(2)
  })

  test('_replayReads subscribes the current effect exactly as re-reading would', () => {
    const a = signal(1)
    const b = signal(2)
    const reads: SubscriberHost[] = []
    _sampleReads(() => a() + b(), reads)
    let runs = 0
    const e = effect(() => {
      runs++
      if (runs === 1) _replayReads(reads)
      else {
        a()
        b()
      }
    })
    expect(runs).toBe(1)
    a.set(5)
    expect(runs).toBe(2)
    b.set(6)
    expect(runs).toBe(3)
    e.dispose()
    a.set(7)
    expect(runs).toBe(3)
  })
})
