/**
 * Compile-time type tests for `StateOf<M>` / `EventOf<M>` — deriving the
 * state/event unions from a machine INSTANCE or a raw CONFIG (the existing
 * `InferStates`/`InferEvents` only handle configs; these accept both).
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { EventOf, InferEvents, InferStates, Machine, StateOf } from '../index'
import { createMachine } from '../index'

const light = createMachine({
  initial: 'green',
  states: {
    green: { on: { NEXT: 'yellow' } },
    yellow: { on: { NEXT: 'red' } },
    red: { on: { NEXT: 'green', RESET: 'green' } },
  },
})

const config = {
  initial: 'idle',
  states: {
    idle: { on: { START: 'running' } },
    running: { on: { STOP: 'idle' } },
    done: { final: true },
  },
} as const

describe('StateOf — machine instance or config', () => {
  it('derives the state union from the INSTANCE', () => {
    expectTypeOf<StateOf<typeof light>>().toEqualTypeOf<'green' | 'yellow' | 'red'>()
  })

  it('derives the state union from a raw CONFIG (delegates to InferStates)', () => {
    expectTypeOf<StateOf<typeof config>>().toEqualTypeOf<'idle' | 'running' | 'done'>()
    expectTypeOf<StateOf<typeof config>>().toEqualTypeOf<InferStates<typeof config>>()
  })

  it('derives from the bare Machine interface', () => {
    expectTypeOf<StateOf<Machine<'a' | 'b', 'GO'>>>().toEqualTypeOf<'a' | 'b'>()
  })

  it('resolves to never for non-machine inputs (negative)', () => {
    expectTypeOf<StateOf<{ notAMachine: true }>>().toEqualTypeOf<never>()
    expectTypeOf<StateOf<string>>().toEqualTypeOf<never>()
  })
})

describe('EventOf — machine instance or config', () => {
  it('derives the event union from the INSTANCE', () => {
    expectTypeOf<EventOf<typeof light>>().toEqualTypeOf<'NEXT' | 'RESET'>()
  })

  it('derives the event union from a raw CONFIG (delegates to InferEvents)', () => {
    expectTypeOf<EventOf<typeof config>>().toEqualTypeOf<'START' | 'STOP'>()
    expectTypeOf<EventOf<typeof config>>().toEqualTypeOf<InferEvents<typeof config>>()
  })

  it('rejects sending an event outside the union (negative)', () => {
    const send = (_e: EventOf<typeof light>) => {}
    send('NEXT')
    // @ts-expect-error — 'JUMP' is not an event of this machine
    send('JUMP')
  })
})

// Runtime smoke — fixture machine actually works.
describe('StateOf/EventOf runtime surface', () => {
  it('the fixture machine transitions', () => {
    expect(light()).toBe('green')
    light.send('NEXT')
    expect(light()).toBe('yellow')
    light.dispose()
  })
})
