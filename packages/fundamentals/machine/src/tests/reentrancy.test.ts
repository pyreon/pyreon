import { effect, watch } from '@pyreon/reactivity'
import { createMachine } from '../machine'

const chain = () =>
  createMachine({
    initial: 'a',
    states: {
      a: { on: { NEXT: 'b' } },
      b: { on: { NEXT: 'c' } },
      c: { on: { NEXT: 'd' } },
      d: {},
    },
  })

describe('createMachine — events sent from a watcher during the batch flush (#3798)', () => {
  it('issue repro: a synchronous watch that sends is not dropped', () => {
    const m = createMachine({
      initial: 'idle',
      states: {
        idle: { on: { START: 'ready' } },
        ready: { on: { FINISH: 'done' } },
        done: {},
      },
    })
    const stop = watch(
      () => m(),
      (state) => {
        if (state === 'ready') m.send('FINISH')
      },
    )
    m.send('START')
    expect(m()).toBe('done')
    stop()
  })

  it('send() returns the settled state including watcher-driven transitions', () => {
    const m = chain()
    const stop = watch(
      () => m(),
      (s) => {
        if (s === 'b') m.send('NEXT')
      },
    )
    expect(m.send('NEXT')).toBe('c')
    stop()
  })

  it('chains watcher events A→B→C→D', () => {
    const m = chain()
    const seen: string[] = []
    const stop = watch(
      () => m(),
      (s) => {
        seen.push(s)
        if (s !== 'd') m.send('NEXT')
      },
    )
    m.send('NEXT')
    expect(m()).toBe('d')
    expect(seen).toEqual(['b', 'c', 'd'])
    stop()
  })

  it('an effect that sends is drained too', () => {
    const m = chain()
    const stop = effect(() => {
      if (m() === 'b') m.send('NEXT')
    })
    m.send('NEXT')
    expect(m()).toBe('c')
    stop.dispose()
  })

  it('onEnter reentrancy still works and keeps FIFO order with watcher events', () => {
    const m = createMachine({
      initial: 'a',
      states: {
        a: { on: { GO: 'b' } },
        b: { on: { VIA_ENTER: 'c', VIA_WATCH: 'd' } },
        c: {},
        d: {},
      },
    })
    const log: string[] = []
    m.onTransition((f, t) => log.push(`${f}>${t}`))
    m.onEnter('b', () => m.send('VIA_ENTER'))
    m.send('GO')
    expect(m()).toBe('c')
    expect(log).toEqual(['a>b', 'b>c'])
  })

  it('a watcher disposed mid-chain stops the chain without losing earlier events', () => {
    const m = chain()
    let stop: () => void = () => {}
    stop = watch(
      () => m(),
      (s) => {
        if (s === 'b') m.send('NEXT')
        if (s === 'c') stop()
      },
    )
    m.send('NEXT')
    expect(m()).toBe('c')
    m.send('NEXT')
    expect(m()).toBe('d')
  })

  it('an event sent from a watcher of a DIFFERENT machine is processed', () => {
    const a = chain()
    const b = createMachine({
      initial: 'x',
      states: { x: { on: { GO: 'y' } }, y: {} },
    })
    const stop = watch(
      () => b(),
      (s) => {
        if (s === 'y') a.send('NEXT')
      },
    )
    // b's watcher fires while a is mid-macrostep (a's onEnter drives b).
    a.onEnter('b', () => b.send('GO'))
    a.send('NEXT')
    expect(b()).toBe('y')
    expect(a()).toBe('c')
    stop()
  })

  it('a send made while another send is draining after the flush is not lost (nested batch)', () => {
    const m = chain()
    const stop = watch(
      () => m(),
      (s) => {
        if (s === 'b') {
          m.send('NEXT')
          m.send('NEXT')
        }
      },
    )
    m.send('NEXT')
    expect(m()).toBe('d')
    stop()
  })

  it('reset() from a watcher does not drop events queued behind it', () => {
    const m = chain()
    let once = true
    const stop = watch(
      () => m(),
      (s) => {
        if (s === 'b' && once) {
          once = false
          m.reset()
          m.send('NEXT')
        }
      },
    )
    m.send('NEXT')
    expect(m()).toBe('b')
    stop()
  })

  it('an infinite watcher send loop throws a [Pyreon] error instead of hanging, and the machine recovers', () => {
    const m = createMachine({
      initial: 'on',
      states: { on: { on: { TOGGLE: 'off' } }, off: { on: { TOGGLE: 'on' } } },
    })
    const stop = watch(
      () => m(),
      () => {
        m.send('TOGGLE')
      },
    )
    // The throw is raised inside the drain; watch callbacks swallow nothing,
    // so it surfaces from the outer send().
    expect(() => m.send('TOGGLE')).toThrow(/\[Pyreon\] machine: more than 10000 events/)
    stop()
    // processing was released — the machine still works.
    const s = m()
    expect(m.send('TOGGLE')).not.toBe(s)
  })

  it('an infinite onEnter send loop is guarded too', () => {
    const m = createMachine({
      initial: 'on',
      states: { on: { on: { T: 'off' } }, off: { on: { T: 'on' } } },
    })
    m.onEnter('on', () => m.send('T'))
    m.onEnter('off', () => m.send('T'))
    expect(() => m.send('T')).toThrow(/infinite send loop/)
  })
})
