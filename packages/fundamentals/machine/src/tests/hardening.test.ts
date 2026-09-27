import { effect } from '@pyreon/reactivity'
import { createMachine } from '../machine'

// ─── Prototype-named events / states ────────────────────────────────────────

describe('createMachine — inherited member names are not transitions', () => {
  const make = () =>
    createMachine({
      initial: 'idle',
      states: {
        idle: { on: { GO: 'busy' } },
        busy: { on: { STOP: 'idle' } },
      },
    })

  it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf'])(
    'send(%s) is an unhandled event, not a move into an undefined state',
    (name) => {
      const m = make()
      expect(m.send(name as never)).toBe('idle')
      expect(m()).toBe('idle')
      expect(m.can(name as never)).toBe(false)
      // Still fully operational afterwards.
      expect(m.send('GO')).toBe('busy')
    },
  )

  it('rejects an initial state that only exists on Object.prototype', () => {
    expect(() =>
      createMachine({ initial: 'toString' as never, states: { idle: {} } }),
    ).toThrow(/initial state 'toString' is not defined/)
  })

  it('rejects a transition target that only exists on Object.prototype', () => {
    expect(() =>
      createMachine({
        initial: 'idle',
        states: { idle: { on: { GO: 'constructor' as never } } },
      }),
    ).toThrow(/transition target 'constructor'/)
    expect(() =>
      createMachine({
        initial: 'idle',
        states: { idle: { always: 'valueOf' as never } },
      }),
    ).toThrow(/transition target 'valueOf'/)
  })
})

// ─── Throwing listeners ──────────────────────────────────────────────────────

describe('createMachine — a throwing listener never aborts a transition', () => {
  let errSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errSpy.mockRestore())

  it('onExit throwing still completes the transition and runs later listeners', () => {
    const m = createMachine({
      initial: 'idle',
      states: { idle: { on: { GO: 'busy' } }, busy: {} },
    })
    const log: string[] = []
    m.onExit('idle', () => {
      throw new Error('exit boom')
    })
    m.onTransition((f, t) => log.push(`${f}->${t}`))
    m.onEnter('busy', () => log.push('enter busy'))
    expect(m.send('GO')).toBe('busy')
    expect(m()).toBe('busy')
    expect(log).toEqual(['idle->busy', 'enter busy'])
    expect(errSpy).toHaveBeenCalledTimes(1)
    expect(String(errSpy.mock.calls[0]?.[0])).toContain('[Pyreon]')
  })

  it('onEnter throwing still runs the always-cascade and onDone', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { GO: 'check' } },
        check: { always: 'done' },
        done: { final: true },
      },
    })
    const done = vi.fn()
    m.onEnter('check', () => {
      throw new Error('enter boom')
    })
    m.onDone(done)
    expect(m.send('GO')).toBe('done')
    expect(done).toHaveBeenCalledTimes(1)
  })
})

// ─── Re-entrant send ─────────────────────────────────────────────────────────

describe('createMachine — send() from a listener is queued until the macrostep completes', () => {
  it('runs every listener of the current step before the queued event', () => {
    const m = createMachine({
      initial: 'a',
      states: {
        a: { on: { NEXT: 'b' } },
        b: { on: { NEXT: 'c' } },
        c: {},
      },
    })
    const log: string[] = []
    m.onEnter('b', () => {
      log.push('enter b (1)')
      m.send('NEXT')
      log.push(`after nested send: ${m()}`)
    })
    m.onEnter('b', () => log.push(`enter b (2) sees ${m()}`))
    m.onTransition((f, t) => log.push(`${f}->${t}`))

    expect(m.send('NEXT')).toBe('c')
    expect(log).toEqual([
      'a->b',
      'enter b (1)',
      'after nested send: b',
      'enter b (2) sees b',
      'b->c',
    ])
  })

  it('a reactive reader settles on the final state only', () => {
    const m = createMachine({
      initial: 'a',
      states: { a: { on: { NEXT: 'b' } }, b: { on: { NEXT: 'c' } }, c: {} },
    })
    m.onEnter('b', () => m.send('NEXT'))
    const seen: string[] = []
    effect(() => {
      seen.push(m())
    })
    m.send('NEXT')
    expect(seen).toEqual(['a', 'c'])
  })

  it('a queued event whose transition is unhandled is a no-op', () => {
    const m = createMachine({
      initial: 'a',
      states: { a: { on: { NEXT: 'b' } }, b: {} },
    })
    m.onEnter('b', () => m.send('NEXT'))
    expect(m.send('NEXT')).toBe('b')
  })
})

describe('createMachine — an own event key whose transition is undefined', () => {
  it('is an unhandled event', () => {
    const m = createMachine({
      initial: 'idle',
      states: { idle: { on: { GO: undefined as never, OK: 'busy' } }, busy: {} },
    })
    expect(m.send('GO' as never)).toBe('idle')
    expect(m.send('OK')).toBe('busy')
  })
})
