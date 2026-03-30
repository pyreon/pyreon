/**
 * @pyreon/machine — Reactive state machines for Pyreon.
 *
 * A machine is a constrained signal — it can only hold specific values
 * and can only transition between them via specific events.
 * Everything else (data, side effects, async) uses existing Pyreon primitives.
 *
 * @example
 * ```tsx
 * import { createMachine } from '@pyreon/machine'
 *
 * const machine = createMachine({
 *   initial: 'idle',
 *   states: {
 *     idle: { on: { FETCH: 'loading' } },
 *     loading: { on: { SUCCESS: 'done', ERROR: 'error' } },
 *     done: {},
 *     error: { on: { RETRY: 'loading' } },
 *   },
 * })
 *
 * machine()              // 'idle' — reads like a signal
 * machine.send('FETCH')  // transition
 * {() => machine.matches('loading') && <Spinner />}
 * ```
 */

export { createMachine } from './machine'

// Types
export type {
  EnterCallback,
  InferEvents,
  InferStates,
  Machine,
  MachineConfig,
  MachineEvent,
  StateConfig,
  TransitionCallback,
  TransitionConfig,
} from './types'
