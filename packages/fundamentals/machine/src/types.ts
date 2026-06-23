/**
 * A transition target — either a state name or an object with target and guard.
 */
export type TransitionConfig<TState extends string> =
  | TState
  | { target: TState; guard: (payload?: unknown) => boolean }

/**
 * State definition — maps event names to transition configs.
 */
export interface StateConfig<TState extends string, TEvent extends string> {
  on?: Partial<Record<TEvent, TransitionConfig<TState>>>
  /**
   * Eventless ("always") transitions — evaluated immediately on entering this
   * state (and for the initial state at creation). The first whose guard passes
   * (or the first unguarded one) fires synchronously, then the new state's
   * `always` is re-evaluated. Guards receive no payload — read external signals.
   * Use for transient/condition states (e.g. branch on a computed value).
   */
  always?: TransitionConfig<TState> | TransitionConfig<TState>[]
  /**
   * Marks a terminal state. `machine.isFinal()` reads true and
   * `machine.onDone(cb)` listeners fire when this state is entered.
   */
  final?: boolean
}

/**
 * Machine definition — initial state and state configs.
 */
export interface MachineConfig<TState extends string, TEvent extends string> {
  initial: TState
  states: Record<TState, StateConfig<TState, TEvent>>
}

/**
 * Event object passed to listeners.
 */
export interface MachineEvent<TEvent extends string = string> {
  type: TEvent
  payload?: unknown
}

/**
 * Callback for onEnter — receives the event that caused the transition.
 */
export type EnterCallback<TEvent extends string = string> = (event: MachineEvent<TEvent>) => void

/**
 * Callback for onTransition — receives from state, to state, and the event.
 */
export type TransitionCallback<TState extends string = string, TEvent extends string = string> = (
  from: TState,
  to: TState,
  event: MachineEvent<TEvent>,
) => void

/**
 * The machine instance returned by `createMachine()`.
 */
export interface Machine<TState extends string, TEvent extends string> {
  /** Read current state — reactive in effects/computeds/JSX */
  (): TState

  /** Send an event to trigger a transition */
  send: (event: TEvent, payload?: unknown) => void

  /** Check if the machine is in one of the given states — reactive */
  matches: (...states: TState[]) => boolean

  /**
   * Check if an event would trigger a valid transition from the current state.
   * Pass `payload` to evaluate a guarded transition precisely (predicts
   * `send` exactly); without a payload, a guarded transition reports `true`
   * if the event exists (the guard may still reject at send time).
   */
  can: (event: TEvent, payload?: unknown) => boolean

  /** Get all valid events from the current state — reactive */
  nextEvents: () => TEvent[]

  /** Reactive — true when the current state is marked `final` */
  isFinal: () => boolean

  /** Reset to initial state (re-runs initial `always` transitions) */
  reset: () => void

  /** Register a callback for when the machine enters a specific state */
  onEnter: (state: TState, callback: EnterCallback<TEvent>) => () => void

  /** Register a callback for when the machine leaves a specific state (fires before the new state's onEnter) */
  onExit: (state: TState, callback: EnterCallback<TEvent>) => () => void

  /** Register a callback for any state transition */
  onTransition: (callback: TransitionCallback<TState, TEvent>) => () => void

  /** Register a callback for when the machine enters any `final` state */
  onDone: (callback: EnterCallback<TEvent>) => () => void

  /** Remove all listeners and clean up */
  dispose: () => void
}

// ─── Type inference helpers ──────────────────────────────────────────────────

/** Extract state names from a machine config */
export type InferStates<T> = T extends { states: Record<infer S, unknown> } ? S & string : never

/**
 * Extract event names from a machine config — the union of every state's `on`
 * keys. Mapped-type form (vs a single `Record<…infer E…>`) so it robustly
 * unions across heterogeneous state shapes: states with only `always` / `final`
 * and no `on` contribute `never` (which drops out of the union) instead of
 * collapsing the whole inference to `never`.
 */
export type InferEvents<T> = T extends { states: infer S }
  ? {
      [K in keyof S]: S[K] extends { on: infer O } ? keyof O : never
    }[keyof S] &
      string
  : never
