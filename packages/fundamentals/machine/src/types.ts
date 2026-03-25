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

  /** Check if an event would trigger a valid transition from current state */
  can: (event: TEvent) => boolean

  /** Get all valid events from the current state — reactive */
  nextEvents: () => TEvent[]

  /** Reset to initial state */
  reset: () => void

  /** Register a callback for when the machine enters a specific state */
  onEnter: (state: TState, callback: EnterCallback<TEvent>) => () => void

  /** Register a callback for any state transition */
  onTransition: (callback: TransitionCallback<TState, TEvent>) => () => void

  /** Remove all listeners and clean up */
  dispose: () => void
}

// ─── Type inference helpers ──────────────────────────────────────────────────

/** Extract state names from a machine config */
export type InferStates<T> = T extends { states: Record<infer S, unknown> } ? S & string : never

/** Extract event names from a machine config */
export type InferEvents<T> = T extends {
  states: Record<string, { on?: Partial<Record<infer E, unknown>> }>
}
  ? E & string
  : never
