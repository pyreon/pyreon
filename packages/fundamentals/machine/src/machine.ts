import { signal } from '@pyreon/reactivity'
import type {
  EnterCallback,
  InferEvents,
  InferStates,
  Machine,
  MachineConfig,
  MachineEvent,
  TransitionCallback,
  TransitionConfig,
} from './types'

/**
 * Create a reactive state machine — a constrained signal with type-safe transitions.
 *
 * The returned instance is callable (reads like a signal) and exposes
 * `send()`, `matches()`, `can()`, and listeners for state changes.
 *
 * @param config - Machine definition with initial state and state configs
 * @returns A reactive machine instance
 *
 * @example
 * ```tsx
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
 * machine()              // 'idle'
 * machine.send('FETCH')
 * machine()              // 'loading'
 *
 * // Reactive in JSX
 * {() => machine.matches('loading') && <Spinner />}
 * ```
 */
export function createMachine<const TConfig extends MachineConfig<string, string>>(
  config: TConfig,
): Machine<InferStates<TConfig>, InferEvents<TConfig>> {
  type TState = InferStates<TConfig>
  type TEvent = InferEvents<TConfig>

  const { initial, states } = config as unknown as MachineConfig<TState, TEvent>

  // Validate initial state
  if (!(initial in states)) {
    throw new Error(`[Pyreon] machine: initial state '${initial}' is not defined in states`)
  }

  const current = signal<TState>(initial)
  const enterListeners = new Map<TState, Set<EnterCallback<TEvent>>>()
  const exitListeners = new Map<TState, Set<EnterCallback<TEvent>>>()
  const transitionListeners = new Set<TransitionCallback<TState, TEvent>>()
  const doneListeners = new Set<EnterCallback<TEvent>>()

  // Synthetic event used for the eventless cascade at creation/reset, where no
  // real event triggered the transition. Listeners registered after creation
  // never observe it; it only fills the callback signature.
  const INIT_EVENT: MachineEvent<TEvent> = { type: '' as TEvent }

  // Max eventless ('always') steps in one macrostep — guards an infinite
  // always-loop (a config error) instead of hanging.
  const MAX_ALWAYS_STEPS = 1000

  function resolveTransition(event: TEvent, payload?: unknown): TState | null {
    const stateConfig = states[current.peek()]
    if (!stateConfig?.on) return null

    const transition = stateConfig.on[event] as TransitionConfig<TState> | undefined
    if (!transition) return null

    if (typeof transition === 'string') {
      return transition
    }

    // Guarded transition
    if (transition.guard && !transition.guard(payload)) {
      return null
    }

    return transition.target
  }

  // Resolve the eventless ('always') transition for a state, if any fires.
  // First unguarded entry — or first whose guard passes — wins. Guards receive
  // no payload (eventless), so they read external signals instead.
  function resolveAlways(state: TState): TState | null {
    const always = states[state]?.always
    if (!always) return null
    const list = Array.isArray(always) ? always : [always]
    for (const t of list) {
      if (typeof t === 'string') return t
      if (!t.guard || t.guard(undefined)) return t.target
    }
    return null
  }

  // Perform a single transition: exit(from) → set → transition → enter(to) →
  // done(if final). onExit fires while still in `from` (state-chart order:
  // exit before the state change is observable); onTransition/onEnter after.
  function doTransition(from: TState, to: TState, event: MachineEvent<TEvent>): void {
    const exits = exitListeners.get(from)
    if (exits) for (const cb of exits) cb(event)

    current.set(to)

    for (const cb of transitionListeners) cb(from, to, event)

    const enters = enterListeners.get(to)
    if (enters) for (const cb of enters) cb(event)

    if (states[to]?.final) {
      for (const cb of doneListeners) cb(event)
    }
  }

  // Drain eventless transitions from the current state until none fire.
  function runAlways(event: MachineEvent<TEvent>): void {
    let steps = 0
    let next = resolveAlways(current.peek())
    while (next !== null) {
      if (++steps > MAX_ALWAYS_STEPS) {
        throw new Error(
          `[Pyreon] machine: eventless ('always') transitions exceeded ${MAX_ALWAYS_STEPS} steps — likely an infinite loop (check 'always' guards)`,
        )
      }
      doTransition(current.peek(), next, event)
      next = resolveAlways(current.peek())
    }
  }

  // The machine instance — callable like a signal
  function machine(): TState {
    return current()
  }

  machine.send = (event: TEvent, payload?: unknown): void => {
    const target = resolveTransition(event, payload)
    if (target === null) return

    const machineEvent: MachineEvent<TEvent> = { type: event, payload }
    doTransition(current.peek(), target, machineEvent)
    runAlways(machineEvent)
  }

  machine.matches = (...matchStates: TState[]): boolean => {
    const state = current()
    return matchStates.includes(state)
  }

  const NO_PAYLOAD = Symbol('no-payload')
  machine.can = (event: TEvent, payload: unknown = NO_PAYLOAD): boolean => {
    const stateConfig = states[current()]
    const transition = stateConfig?.on?.[event] as TransitionConfig<TState> | undefined
    if (!transition) return false

    // Unguarded transition — always available.
    if (typeof transition === 'string' || !transition.guard) return true

    // Guarded: evaluate precisely when a payload is given (predicts `send`
    // exactly); without one, report true — the event exists, but the guard may
    // still reject at send time (backward-compatible behaviour).
    if (payload === NO_PAYLOAD) return true
    return transition.guard(payload)
  }

  machine.nextEvents = (): TEvent[] => {
    const stateConfig = states[current()]
    if (!stateConfig?.on) return []
    return Object.keys(stateConfig.on) as TEvent[]
  }

  machine.isFinal = (): boolean => states[current()]?.final === true

  machine.reset = (): void => {
    current.set(initial)
    runAlways(INIT_EVENT)
  }

  machine.onEnter = (state: TState, callback: EnterCallback<TEvent>): (() => void) => {
    if (!enterListeners.has(state)) {
      enterListeners.set(state, new Set())
    }
    enterListeners.get(state)!.add(callback)

    return () => {
      enterListeners.get(state)?.delete(callback)
    }
  }

  machine.onExit = (state: TState, callback: EnterCallback<TEvent>): (() => void) => {
    if (!exitListeners.has(state)) {
      exitListeners.set(state, new Set())
    }
    exitListeners.get(state)!.add(callback)

    return () => {
      exitListeners.get(state)?.delete(callback)
    }
  }

  machine.onTransition = (callback: TransitionCallback<TState, TEvent>): (() => void) => {
    transitionListeners.add(callback)
    return () => {
      transitionListeners.delete(callback)
    }
  }

  machine.onDone = (callback: EnterCallback<TEvent>): (() => void) => {
    doneListeners.add(callback)
    return () => {
      doneListeners.delete(callback)
    }
  }

  machine.dispose = (): void => {
    enterListeners.clear()
    exitListeners.clear()
    transitionListeners.clear()
    doneListeners.clear()
  }

  // Settle the initial state's eventless ('always') transitions at creation —
  // no listeners exist yet, so this only resolves the reported initial state.
  runAlways(INIT_EVENT)

  return machine as Machine<TState, TEvent>
}
