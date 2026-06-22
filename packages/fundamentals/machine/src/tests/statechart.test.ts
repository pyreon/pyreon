import { signal } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { createMachine } from '../index'

// ─── onExit ──────────────────────────────────────────────────────────────────

describe('createMachine — onExit', () => {
  it('fires when leaving the specified state, with the triggering event', () => {
    const m = createMachine({
      initial: 'a',
      states: { a: { on: { GO: 'b' } }, b: {} },
    })
    const exited: unknown[] = []
    m.onExit('a', (e) => exited.push(e.payload))
    m.send('GO', { reason: 'x' })
    expect(exited).toEqual([{ reason: 'x' }])
  })

  it('does not fire for states that were not exited', () => {
    const m = createMachine({
      initial: 'a',
      states: { a: { on: { GO: 'b' } }, b: { on: { GO: 'c' } }, c: {} },
    })
    const fn = vi.fn()
    m.onExit('c', fn)
    m.send('GO') // a -> b
    m.send('GO') // b -> c
    expect(fn).not.toHaveBeenCalled()
  })

  it('fires before the new state onEnter (state-chart order: exit → transition → enter)', () => {
    const m = createMachine({
      initial: 'a',
      states: { a: { on: { GO: 'b' } }, b: {} },
    })
    const seq: string[] = []
    m.onExit('a', () => seq.push(`exit:a@${m()}`))
    m.onTransition((from, to) => seq.push(`trans:${from}->${to}@${m()}`))
    m.onEnter('b', () => seq.push(`enter:b@${m()}`))
    m.send('GO')
    // onExit fires while still in 'a'; onTransition/onEnter fire in 'b'.
    expect(seq).toEqual(['exit:a@a', 'trans:a->b@b', 'enter:b@b'])
  })

  it('fires on self-transitions', () => {
    const m = createMachine({
      initial: 'a',
      states: { a: { on: { PING: 'a' } } },
    })
    const fn = vi.fn()
    m.onExit('a', fn)
    m.send('PING')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('supports multiple listeners on the same state', () => {
    const m = createMachine({
      initial: 'a',
      states: { a: { on: { GO: 'b' } }, b: {} },
    })
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    m.onExit('a', fn1)
    m.onExit('a', fn2) // second registration — set already exists
    m.send('GO')
    expect(fn1).toHaveBeenCalledOnce()
    expect(fn2).toHaveBeenCalledOnce()
  })

  it('unsubscribes', () => {
    const m = createMachine({
      initial: 'a',
      states: { a: { on: { GO: 'b' } }, b: { on: { BACK: 'a' } } },
    })
    const fn = vi.fn()
    const off = m.onExit('a', fn)
    m.send('GO')
    expect(fn).toHaveBeenCalledOnce()
    off()
    m.send('BACK') // a again
    m.send('GO') // exit a again, but listener removed
    expect(fn).toHaveBeenCalledOnce()
  })
})

// ─── Eventless ('always') transitions ─────────────────────────────────────────

describe('createMachine — eventless (always) transitions', () => {
  it('settles the initial state through an unconditional always at creation', () => {
    const m = createMachine({
      initial: 'start',
      states: { start: { always: 'ready' }, ready: {} },
    })
    expect(m()).toBe('ready')
  })

  it('branches via guards reading external signals (transient/condition state)', () => {
    const mk = (score: number) => {
      const s = signal(score)
      return createMachine({
        initial: 'check',
        states: {
          check: { always: [{ target: 'pass', guard: () => s() >= 50 }, 'fail'] },
          pass: {},
          fail: {},
        },
      })
    }
    expect(mk(60)()).toBe('pass')
    expect(mk(10)()).toBe('fail')
  })

  it('cascades through chained always states', () => {
    const m = createMachine({
      initial: 'a',
      states: { a: { always: 'b' }, b: { always: 'c' }, c: {} },
    })
    expect(m()).toBe('c')
  })

  it('runs always after a normal event transition', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { GO: 'transient' } },
        transient: { always: 'done' },
        done: {},
      },
    })
    expect(m()).toBe('idle')
    m.send('GO')
    expect(m()).toBe('done') // idle -> transient -(always)-> done in one send
  })

  it('fires enter/exit/transition listeners for each always step', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { GO: 'mid' } },
        mid: { always: 'end' },
        end: {},
      },
    })
    const entered: string[] = []
    m.onEnter('mid', () => entered.push('mid'))
    m.onEnter('end', () => entered.push('end'))
    const exited: string[] = []
    m.onExit('mid', () => exited.push('mid'))
    m.send('GO')
    expect(entered).toEqual(['mid', 'end'])
    expect(exited).toEqual(['mid'])
  })

  it('does not transition when no always guard passes', () => {
    const s = signal(0)
    const m = createMachine({
      initial: 'gate',
      states: {
        gate: { always: { target: 'open', guard: () => s() > 0 } },
        open: {},
      },
    })
    expect(m()).toBe('gate') // guard fails at creation, stays
  })

  it('throws on an infinite always-loop (config error)', () => {
    expect(() =>
      createMachine({ initial: 's', states: { s: { always: 's' } } }),
    ).toThrow('infinite loop')
  })
})

// ─── Final states ──────────────────────────────────────────────────────────────

describe('createMachine — final states', () => {
  it('isFinal() reflects the current state', () => {
    const m = createMachine({
      initial: 'active',
      states: { active: { on: { FINISH: 'done' } }, done: { final: true } },
    })
    expect(m.isFinal()).toBe(false)
    m.send('FINISH')
    expect(m.isFinal()).toBe(true)
  })

  it('onDone fires when entering a final state, with the event', () => {
    const m = createMachine({
      initial: 'active',
      states: { active: { on: { FINISH: 'done' } }, done: { final: true } },
    })
    const done = vi.fn()
    m.onDone(done)
    m.send('FINISH', { ok: true })
    expect(done).toHaveBeenCalledOnce()
    expect(done.mock.calls[0]![0]).toEqual({ type: 'FINISH', payload: { ok: true } })
  })

  it('onDone fires when an always transition lands on a final state', () => {
    const m = createMachine({
      initial: 'active',
      states: {
        active: { on: { FINISH: 'wrap' } },
        wrap: { always: 'done' },
        done: { final: true },
      },
    })
    const done = vi.fn()
    m.onDone(done)
    m.send('FINISH')
    expect(m()).toBe('done')
    expect(done).toHaveBeenCalledOnce()
  })

  it('onDone unsubscribes', () => {
    const m = createMachine({
      initial: 'a',
      states: { a: { on: { END: 'z' }, final: false }, z: { final: true, on: { BACK: 'a' } } },
    })
    const fn = vi.fn()
    const off = m.onDone(fn)
    m.send('END')
    expect(fn).toHaveBeenCalledOnce()
    off()
    m.send('BACK')
    m.send('END')
    expect(fn).toHaveBeenCalledOnce()
  })
})

// ─── can(event, payload) precision ─────────────────────────────────────────────

describe('createMachine — can(event, payload?)', () => {
  const make = () =>
    createMachine({
      initial: 'loggedOut',
      states: {
        loggedOut: {
          on: {
            LOGIN: { target: 'loggedIn', guard: (p: unknown) => (p as { ok: boolean }).ok },
            VISIT: 'guest',
          },
        },
        loggedIn: {},
        guest: {},
      },
    })

  it('evaluates the guard precisely when a payload is given', () => {
    const m = make()
    expect(m.can('LOGIN', { ok: true })).toBe(true)
    expect(m.can('LOGIN', { ok: false })).toBe(false)
  })

  it('reports true for a guarded event with no payload (backward-compatible)', () => {
    const m = make()
    expect(m.can('LOGIN')).toBe(true)
  })

  it('returns true for an unguarded available event', () => {
    const m = make()
    expect(m.can('VISIT')).toBe(true)
  })

  it('returns false for an event not available in the current state', () => {
    const m = make()
    expect(m.can('LOGOUT' as 'LOGIN')).toBe(false)
  })

  it('predicts send() exactly when given the payload', () => {
    const m = make()
    expect(m.can('LOGIN', { ok: false })).toBe(false)
    m.send('LOGIN', { ok: false })
    expect(m()).toBe('loggedOut') // matches can() === false
    expect(m.can('LOGIN', { ok: true })).toBe(true)
    m.send('LOGIN', { ok: true })
    expect(m()).toBe('loggedIn') // matches can() === true
  })
})

// ─── reset re-runs initial always ──────────────────────────────────────────────

describe('createMachine — reset with always', () => {
  it('re-settles the initial always cascade on reset', () => {
    const m = createMachine({
      initial: 'boot',
      states: {
        boot: { always: 'home' },
        home: { on: { LEAVE: 'away' } },
        away: {},
      },
    })
    expect(m()).toBe('home')
    m.send('LEAVE')
    expect(m()).toBe('away')
    m.reset()
    expect(m()).toBe('home') // reset → boot → (always) → home
  })
})

// ─── dispose clears the new listener sets ──────────────────────────────────────

describe('createMachine — dispose', () => {
  it('clears onExit + onDone listeners', () => {
    const m = createMachine({
      initial: 'a',
      states: { a: { on: { GO: 'z' } }, z: { final: true } },
    })
    const exit = vi.fn()
    const done = vi.fn()
    m.onExit('a', exit)
    m.onDone(done)
    m.dispose()
    m.send('GO')
    expect(exit).not.toHaveBeenCalled()
    expect(done).not.toHaveBeenCalled()
  })
})
