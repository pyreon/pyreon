import { computed, effect, signal } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { createMachine } from '../index'

describe('createMachine', () => {
  // ─── Basic state and transitions ─────────────────────────────────────

  describe('basic transitions', () => {
    it('starts in initial state', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: {},
        },
      })
      expect(m()).toBe('idle')
    })

    it('transitions on valid event', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: { on: { STOP: 'idle' } },
        },
      })
      m.send('START')
      expect(m()).toBe('running')
    })

    it('ignores invalid events (no-op)', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: { on: { STOP: 'idle' } },
        },
      })
      m.send('STOP' as any) // not valid in 'idle'
      expect(m()).toBe('idle')
    })

    it('supports self-transitions', () => {
      const m = createMachine({
        initial: 'counting',
        states: {
          counting: { on: { INCREMENT: 'counting' } },
        },
      })
      m.send('INCREMENT')
      expect(m()).toBe('counting')
    })

    it('supports multiple transitions from one state', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { FETCH: 'loading', CANCEL: 'cancelled' } },
          loading: {},
          cancelled: {},
        },
      })

      m.send('CANCEL')
      expect(m()).toBe('cancelled')
    })

    it('handles states with no transitions (final states)', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { DONE: 'finished' } },
          finished: {},
        },
      })
      m.send('DONE')
      expect(m()).toBe('finished')
      m.send('DONE') // ignored — no transitions from 'finished'
      expect(m()).toBe('finished')
    })

    it('throws on invalid initial state', () => {
      expect(() =>
        createMachine({
          initial: 'nonexistent' as any,
          states: {
            idle: {},
          },
        }),
      ).toThrow('[@pyreon/machine] Initial state')
    })
  })

  // ─── Guards ──────────────────────────────────────────────────────────

  describe('guards', () => {
    it('transitions when guard returns true', () => {
      const m = createMachine({
        initial: 'editing',
        states: {
          editing: {
            on: {
              SUBMIT: { target: 'submitting', guard: () => true },
            },
          },
          submitting: {},
        },
      })
      m.send('SUBMIT')
      expect(m()).toBe('submitting')
    })

    it('blocks transition when guard returns false', () => {
      const m = createMachine({
        initial: 'editing',
        states: {
          editing: {
            on: {
              SUBMIT: { target: 'submitting', guard: () => false },
            },
          },
          submitting: {},
        },
      })
      m.send('SUBMIT')
      expect(m()).toBe('editing')
    })

    it('guard receives event payload', () => {
      const guardFn = vi.fn((payload?: unknown) => {
        return (payload as any)?.valid === true
      })

      const m = createMachine({
        initial: 'editing',
        states: {
          editing: {
            on: {
              SUBMIT: { target: 'submitting', guard: guardFn },
            },
          },
          submitting: {},
        },
      })

      m.send('SUBMIT', { valid: false })
      expect(m()).toBe('editing')
      expect(guardFn).toHaveBeenCalledWith({ valid: false })

      m.send('SUBMIT', { valid: true })
      expect(m()).toBe('submitting')
    })

    it('guard with reactive signal', () => {
      const isValid = signal(false)

      const m = createMachine({
        initial: 'editing',
        states: {
          editing: {
            on: {
              SUBMIT: {
                target: 'submitting',
                guard: () => isValid.peek(),
              },
            },
          },
          submitting: {},
        },
      })

      m.send('SUBMIT')
      expect(m()).toBe('editing')

      isValid.set(true)
      m.send('SUBMIT')
      expect(m()).toBe('submitting')
    })
  })

  // ─── matches ─────────────────────────────────────────────────────────

  describe('matches()', () => {
    it('returns true for current state', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: {},
        },
      })
      expect(m.matches('idle')).toBe(true)
      expect(m.matches('running')).toBe(false)
    })

    it('supports multiple states', () => {
      const m = createMachine({
        initial: 'loading',
        states: {
          idle: {},
          loading: {},
          error: {},
        },
      })
      expect(m.matches('loading', 'error')).toBe(true)
      expect(m.matches('idle', 'error')).toBe(false)
    })

    it('is reactive in effects', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: { on: { STOP: 'idle' } },
        },
      })
      const results: boolean[] = []

      effect(() => {
        results.push(m.matches('running'))
      })

      expect(results).toEqual([false])

      m.send('START')
      expect(results).toEqual([false, true])

      m.send('STOP')
      expect(results).toEqual([false, true, false])
    })
  })

  // ─── can ─────────────────────────────────────────────────────────────

  describe('can()', () => {
    it('returns true for valid events', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: { on: { STOP: 'idle' } },
        },
      })
      expect(m.can('START')).toBe(true)
      expect(m.can('STOP')).toBe(false)
    })

    it('is reactive', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: { on: { STOP: 'idle' } },
        },
      })
      const results: boolean[] = []

      effect(() => {
        results.push(m.can('STOP'))
      })

      expect(results).toEqual([false])

      m.send('START')
      expect(results).toEqual([false, true])
    })

    it('returns true for guarded transitions (guard not evaluated)', () => {
      const m = createMachine({
        initial: 'editing',
        states: {
          editing: {
            on: {
              SUBMIT: { target: 'submitting', guard: () => false },
            },
          },
          submitting: {},
        },
      })
      // can() returns true because the event exists, even though guard would fail
      expect(m.can('SUBMIT')).toBe(true)
    })
  })

  // ─── nextEvents ──────────────────────────────────────────────────────

  describe('nextEvents()', () => {
    it('returns available events from current state', () => {
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
    })

    it('returns empty array for final states', () => {
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

    it('is reactive', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: { on: { STOP: 'idle', PAUSE: 'paused' } },
          paused: { on: { RESUME: 'running' } },
        },
      })
      const results: string[][] = []

      effect(() => {
        results.push(m.nextEvents())
      })

      m.send('START')
      expect(results).toHaveLength(2)
      expect(results[1]).toEqual(expect.arrayContaining(['STOP', 'PAUSE']))
    })
  })

  // ─── reset ───────────────────────────────────────────────────────────

  describe('reset()', () => {
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
  })

  // ─── Reactivity ────────────────────────────────────────────────────

  describe('reactivity', () => {
    it('machine() is reactive in effect', () => {
      const m = createMachine({
        initial: 'a',
        states: {
          a: { on: { NEXT: 'b' } },
          b: { on: { NEXT: 'c' } },
          c: {},
        },
      })
      const states: string[] = []

      effect(() => {
        states.push(m())
      })

      m.send('NEXT')
      m.send('NEXT')

      expect(states).toEqual(['a', 'b', 'c'])
    })

    it('machine() is reactive in computed', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { LOAD: 'loading' } },
          loading: { on: { DONE: 'idle' } },
        },
      })

      const isLoading = computed(() => m() === 'loading')
      expect(isLoading()).toBe(false)

      m.send('LOAD')
      expect(isLoading()).toBe(true)

      m.send('DONE')
      expect(isLoading()).toBe(false)
    })
  })

  // ─── onEnter ─────────────────────────────────────────────────────────

  describe('onEnter()', () => {
    it('fires when entering a state', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { LOAD: 'loading' } },
          loading: { on: { DONE: 'idle' } },
        },
      })
      const entered: string[] = []

      m.onEnter('loading', (event) => {
        entered.push(event.type)
      })

      m.send('LOAD')
      expect(entered).toEqual(['LOAD'])
    })

    it('does not fire for other states', () => {
      const m = createMachine({
        initial: 'a',
        states: {
          a: { on: { GO: 'b' } },
          b: { on: { GO: 'c' } },
          c: {},
        },
      })
      const fn = vi.fn()

      m.onEnter('c', fn)
      m.send('GO') // a → b
      expect(fn).not.toHaveBeenCalled()

      m.send('GO') // b → c
      expect(fn).toHaveBeenCalledOnce()
    })

    it('receives event payload', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { SELECT: 'selected' } },
          selected: {},
        },
      })
      let received: unknown = null

      m.onEnter('selected', (event) => {
        received = event.payload
      })

      m.send('SELECT', { id: 42 })
      expect(received).toEqual({ id: 42 })
    })

    it('fires on self-transitions', () => {
      const m = createMachine({
        initial: 'counting',
        states: {
          counting: { on: { INC: 'counting' } },
        },
      })
      const fn = vi.fn()

      m.onEnter('counting', fn)
      m.send('INC')
      m.send('INC')

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('returns unsubscribe function', () => {
      const m = createMachine({
        initial: 'a',
        states: {
          a: { on: { GO: 'b' } },
          b: { on: { GO: 'a' } },
        },
      })
      const fn = vi.fn()

      const unsub = m.onEnter('b', fn)
      m.send('GO') // a → b
      expect(fn).toHaveBeenCalledOnce()

      unsub()
      m.send('GO') // b → a
      m.send('GO') // a → b again
      expect(fn).toHaveBeenCalledOnce() // not called again
    })

    it('multiple listeners for same state', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { GO: 'active' } },
          active: {},
        },
      })
      const fn1 = vi.fn()
      const fn2 = vi.fn()

      m.onEnter('active', fn1)
      m.onEnter('active', fn2)

      m.send('GO')
      expect(fn1).toHaveBeenCalledOnce()
      expect(fn2).toHaveBeenCalledOnce()
    })
  })

  // ─── onTransition ────────────────────────────────────────────────────

  describe('onTransition()', () => {
    it('fires on every transition', () => {
      const m = createMachine({
        initial: 'a',
        states: {
          a: { on: { NEXT: 'b' } },
          b: { on: { NEXT: 'c' } },
          c: {},
        },
      })
      const transitions: [string, string, string][] = []

      m.onTransition((from, to, event) => {
        transitions.push([from, to, event.type])
      })

      m.send('NEXT')
      m.send('NEXT')

      expect(transitions).toEqual([
        ['a', 'b', 'NEXT'],
        ['b', 'c', 'NEXT'],
      ])
    })

    it('does not fire when event is ignored', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: {},
        },
      })
      const fn = vi.fn()

      m.onTransition(fn)
      m.send('STOP' as any) // invalid event
      expect(fn).not.toHaveBeenCalled()
    })

    it('returns unsubscribe function', () => {
      const m = createMachine({
        initial: 'a',
        states: {
          a: { on: { GO: 'b' } },
          b: { on: { GO: 'a' } },
        },
      })
      const fn = vi.fn()

      const unsub = m.onTransition(fn)
      m.send('GO')
      expect(fn).toHaveBeenCalledOnce()

      unsub()
      m.send('GO')
      expect(fn).toHaveBeenCalledOnce() // not called again
    })
  })

  // ─── dispose ─────────────────────────────────────────────────────────

  describe('dispose()', () => {
    it('removes all listeners', () => {
      const m = createMachine({
        initial: 'a',
        states: {
          a: { on: { GO: 'b' } },
          b: { on: { GO: 'a' } },
        },
      })
      const enterFn = vi.fn()
      const transitionFn = vi.fn()

      m.onEnter('b', enterFn)
      m.onTransition(transitionFn)

      m.dispose()

      m.send('GO')
      expect(enterFn).not.toHaveBeenCalled()
      expect(transitionFn).not.toHaveBeenCalled()
    })
  })

  // ─── Real-world patterns ───────────────────────────────────────────

  describe('real-world patterns', () => {
    it('multi-step wizard', () => {
      const m = createMachine({
        initial: 'step1',
        states: {
          step1: { on: { NEXT: 'step2' } },
          step2: { on: { NEXT: 'step3', BACK: 'step1' } },
          step3: { on: { SUBMIT: 'submitting', BACK: 'step2' } },
          submitting: { on: { SUCCESS: 'done', ERROR: 'step3' } },
          done: {},
        },
      })

      m.send('NEXT') // step1 → step2
      m.send('NEXT') // step2 → step3
      expect(m()).toBe('step3')

      m.send('BACK') // step3 → step2
      expect(m()).toBe('step2')

      m.send('NEXT') // step2 → step3
      m.send('SUBMIT') // step3 → submitting
      expect(m()).toBe('submitting')

      m.send('SUCCESS')
      expect(m()).toBe('done')

      // Final state — no more transitions
      m.send('SUBMIT')
      expect(m()).toBe('done')
    })

    it('async fetch with onEnter', () => {
      const m = createMachine({
        initial: 'idle',
        states: {
          idle: { on: { FETCH: 'loading' } },
          loading: { on: { SUCCESS: 'done', ERROR: 'error' } },
          done: { on: { REFETCH: 'loading' } },
          error: { on: { RETRY: 'loading' } },
        },
      })

      const data = signal<string | null>(null)

      m.onEnter('loading', () => {
        // Simulate async — in real code this would be an API call
        data.set('loaded data')
        m.send('SUCCESS')
      })

      m.send('FETCH')
      expect(m()).toBe('done')
      expect(data()).toBe('loaded data')
    })

    it('toggle with reactive UI', () => {
      const m = createMachine({
        initial: 'off',
        states: {
          off: { on: { TOGGLE: 'on' } },
          on: { on: { TOGGLE: 'off' } },
        },
      })

      const labels: string[] = []
      effect(() => {
        labels.push(m.matches('on') ? 'ON' : 'OFF')
      })

      m.send('TOGGLE')
      m.send('TOGGLE')
      m.send('TOGGLE')

      expect(labels).toEqual(['OFF', 'ON', 'OFF', 'ON'])
    })

    it('form with validation guard', () => {
      const isValid = signal(false)

      const m = createMachine({
        initial: 'editing',
        states: {
          editing: {
            on: {
              SUBMIT: {
                target: 'submitting',
                guard: () => isValid.peek(),
              },
            },
          },
          submitting: { on: { SUCCESS: 'done', ERROR: 'editing' } },
          done: {},
        },
      })

      m.send('SUBMIT') // guard fails
      expect(m()).toBe('editing')

      isValid.set(true)
      m.send('SUBMIT') // guard passes
      expect(m()).toBe('submitting')
    })

    it('player with pause/resume', () => {
      const m = createMachine({
        initial: 'stopped',
        states: {
          stopped: { on: { PLAY: 'playing' } },
          playing: { on: { PAUSE: 'paused', STOP: 'stopped' } },
          paused: { on: { PLAY: 'playing', STOP: 'stopped' } },
        },
      })

      m.send('PLAY')
      expect(m()).toBe('playing')

      m.send('PAUSE')
      expect(m()).toBe('paused')

      m.send('PLAY')
      expect(m()).toBe('playing')

      m.send('STOP')
      expect(m()).toBe('stopped')
    })

    it('analytics tracking via onTransition', () => {
      const m = createMachine({
        initial: 'step1',
        states: {
          step1: { on: { NEXT: 'step2' } },
          step2: { on: { NEXT: 'step3' } },
          step3: {},
        },
      })

      const tracked: string[] = []
      m.onTransition((from, to) => {
        tracked.push(`${from} → ${to}`)
      })

      m.send('NEXT')
      m.send('NEXT')

      expect(tracked).toEqual(['step1 → step2', 'step2 → step3'])
    })

    it('reusable machine definition', () => {
      const toggleDef = {
        initial: 'off' as const,
        states: {
          off: { on: { TOGGLE: 'on' as const } },
          on: { on: { TOGGLE: 'off' as const } },
        },
      }

      const m1 = createMachine(toggleDef)
      const m2 = createMachine(toggleDef)

      m1.send('TOGGLE')
      expect(m1()).toBe('on')
      expect(m2()).toBe('off') // independent instance
    })
  })
})
