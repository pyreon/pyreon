import { computed, effect } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { createMachine } from '../index'

describe('createMachine — nextEvents()', () => {
  it('returns valid events from current state', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { FETCH: 'loading', RESET: 'idle' } },
        loading: { on: { SUCCESS: 'done', ERROR: 'error' } },
        done: {},
        error: {},
      },
    })
    expect(m.nextEvents()).toEqual(expect.arrayContaining(['FETCH', 'RESET']))
    expect(m.nextEvents()).toHaveLength(2)
  })

  it('returns empty array for final states (no transitions)', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { DONE: 'finished' } },
        finished: {},
      },
    })
    m.send('DONE')
    expect(m.nextEvents()).toEqual([])
  })

  it('updates after transition', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { START: 'running' } },
        running: { on: { STOP: 'idle', PAUSE: 'paused' } },
        paused: { on: { RESUME: 'running' } },
      },
    })

    expect(m.nextEvents()).toEqual(['START'])

    m.send('START')
    expect(m.nextEvents()).toEqual(expect.arrayContaining(['STOP', 'PAUSE']))

    m.send('PAUSE')
    expect(m.nextEvents()).toEqual(['RESUME'])
  })

  it('is reactive in effects', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { GO: 'active' } },
        active: { on: { STOP: 'idle', PAUSE: 'paused' } },
        paused: {},
      },
    })
    const results: string[][] = []

    effect(() => {
      results.push(m.nextEvents())
    })

    m.send('GO')
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual(['GO'])
    expect(results[1]).toEqual(expect.arrayContaining(['STOP', 'PAUSE']))
  })

  it('includes guarded event names', () => {
    const m = createMachine({
      initial: 'editing',
      states: {
        editing: {
          on: {
            SUBMIT: { target: 'submitting', guard: () => false },
            CANCEL: 'cancelled',
          },
        },
        submitting: {},
        cancelled: {},
      },
    })
    // nextEvents returns all event keys, even guarded ones
    expect(m.nextEvents()).toEqual(expect.arrayContaining(['SUBMIT', 'CANCEL']))
  })
})

describe('createMachine — can()', () => {
  it('returns true for valid events from current state', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { START: 'running' } },
        running: { on: { STOP: 'idle' } },
      },
    })
    expect(m.can('START')).toBe(true)
  })

  it('returns false for events not in current state', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { START: 'running' } },
        running: { on: { STOP: 'idle' } },
      },
    })
    expect(m.can('STOP')).toBe(false)
  })

  it('returns false for completely unknown events', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { START: 'running' } },
        running: {},
      },
    })
    expect(m.can('NONEXISTENT' as any)).toBe(false)
  })

  it('returns false when in a final state (no transitions)', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { DONE: 'finished' } },
        finished: {},
      },
    })
    m.send('DONE')
    expect(m.can('DONE')).toBe(false)
    expect(m.can('START' as any)).toBe(false)
  })

  it('returns true for guarded transitions (guard not evaluated by can())', () => {
    const m = createMachine({
      initial: 'editing',
      states: {
        editing: {
          on: { SUBMIT: { target: 'submitting', guard: () => false } },
        },
        submitting: {},
      },
    })
    // can() checks existence only, not guard
    expect(m.can('SUBMIT')).toBe(true)
  })

  it('is reactive — updates when state changes', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { START: 'running' } },
        running: { on: { STOP: 'idle' } },
      },
    })
    const canStop: boolean[] = []

    effect(() => {
      canStop.push(m.can('STOP'))
    })

    expect(canStop).toEqual([false])

    m.send('START')
    expect(canStop).toEqual([false, true])

    m.send('STOP')
    expect(canStop).toEqual([false, true, false])
  })

  it('works in computed', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { START: 'running' } },
        running: { on: { STOP: 'idle' } },
      },
    })

    const canStart = computed(() => m.can('START'))
    expect(canStart()).toBe(true)

    m.send('START')
    expect(canStart()).toBe(false)
  })
})

describe('createMachine — reset()', () => {
  it('returns to initial state', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { START: 'running' } },
        running: { on: { STOP: 'idle' } },
      },
    })
    m.send('START')
    expect(m()).toBe('running')

    m.reset()
    expect(m()).toBe('idle')
  })

  it('reset from deeply nested state', () => {
    const m = createMachine({
      initial: 'step1',
      states: {
        step1: { on: { NEXT: 'step2' } },
        step2: { on: { NEXT: 'step3' } },
        step3: { on: { NEXT: 'step4' } },
        step4: {},
      },
    })
    m.send('NEXT')
    m.send('NEXT')
    m.send('NEXT')
    expect(m()).toBe('step4')

    m.reset()
    expect(m()).toBe('step1')
  })

  it('reset is reactive', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { GO: 'active' } },
        active: {},
      },
    })
    const states: string[] = []

    effect(() => {
      states.push(m())
    })

    m.send('GO')
    m.reset()

    expect(states).toEqual(['idle', 'active', 'idle'])
  })

  it('reset does not fire onEnter for initial state', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { GO: 'active' } },
        active: { on: { BACK: 'idle' } },
      },
    })
    const fn = vi.fn()
    m.onEnter('idle', fn)

    m.send('GO')
    m.reset() // Sets state directly, does not go through send()
    // reset() uses current.set() directly, not send(), so no enter callback
    expect(fn).not.toHaveBeenCalled()
  })

  it('after reset, transitions work from initial state', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { GO: 'active' } },
        active: { on: { DONE: 'finished' } },
        finished: {},
      },
    })
    m.send('GO')
    m.send('DONE')
    expect(m()).toBe('finished')

    m.reset()
    expect(m()).toBe('idle')

    m.send('GO')
    expect(m()).toBe('active')
  })

  it('reset from initial state is a no-op (same value)', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { GO: 'active' } },
        active: {},
      },
    })

    m.reset()
    expect(m()).toBe('idle')
  })
})

describe('createMachine — dispose()', () => {
  it('removes all onEnter listeners', () => {
    const m = createMachine({
      initial: 'a',
      states: {
        a: { on: { GO: 'b' } },
        b: { on: { GO: 'a' } },
      },
    })
    const fn = vi.fn()
    m.onEnter('b', fn)

    m.dispose()

    m.send('GO')
    expect(fn).not.toHaveBeenCalled()
  })

  it('removes all onTransition listeners', () => {
    const m = createMachine({
      initial: 'a',
      states: {
        a: { on: { GO: 'b' } },
        b: {},
      },
    })
    const fn = vi.fn()
    m.onTransition(fn)

    m.dispose()

    m.send('GO')
    expect(fn).not.toHaveBeenCalled()
  })

  it('machine still transitions after dispose (only listeners removed)', () => {
    const m = createMachine({
      initial: 'a',
      states: {
        a: { on: { GO: 'b' } },
        b: {},
      },
    })
    m.onEnter('b', vi.fn())
    m.onTransition(vi.fn())

    m.dispose()

    m.send('GO')
    expect(m()).toBe('b') // transitions still work
  })

  it('dispose is idempotent', () => {
    const m = createMachine({
      initial: 'a',
      states: {
        a: { on: { GO: 'b' } },
        b: {},
      },
    })
    m.dispose()
    m.dispose() // should not throw
    expect(m()).toBe('a')
  })
})
