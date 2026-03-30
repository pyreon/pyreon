import { signal } from "@pyreon/reactivity";
import type {
  EnterCallback,
  InferEvents,
  InferStates,
  Machine,
  MachineConfig,
  MachineEvent,
  TransitionCallback,
  TransitionConfig,
} from "./types";

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
  type TState = InferStates<TConfig>;
  type TEvent = InferEvents<TConfig>;

  const { initial, states } = config as unknown as MachineConfig<TState, TEvent>;

  // Validate initial state
  if (!(initial in states)) {
    throw new Error(`[@pyreon/machine] Initial state '${initial}' is not defined in states`);
  }

  const current = signal<TState>(initial);
  const enterListeners = new Map<TState, Set<EnterCallback<TEvent>>>();
  const transitionListeners = new Set<TransitionCallback<TState, TEvent>>();

  function resolveTransition(event: TEvent, payload?: unknown): TState | null {
    const stateConfig = states[current.peek()];
    if (!stateConfig?.on) return null;

    const transition = stateConfig.on[event] as TransitionConfig<TState> | undefined;
    if (!transition) return null;

    if (typeof transition === "string") {
      return transition;
    }

    // Guarded transition
    if (transition.guard && !transition.guard(payload)) {
      return null;
    }

    return transition.target;
  }

  // The machine instance — callable like a signal
  function machine(): TState {
    return current();
  }

  machine.send = (event: TEvent, payload?: unknown): void => {
    const target = resolveTransition(event, payload);
    if (target === null) return;

    const from = current.peek();
    const machineEvent: MachineEvent<TEvent> = { type: event, payload };

    current.set(target);

    // Fire transition listeners
    for (const cb of transitionListeners) {
      cb(from, target, machineEvent);
    }

    // Fire enter listeners for the target state
    const listeners = enterListeners.get(target);
    if (listeners) {
      for (const cb of listeners) {
        cb(machineEvent);
      }
    }
  };

  machine.matches = (...matchStates: TState[]): boolean => {
    const state = current();
    return matchStates.includes(state);
  };

  machine.can = (event: TEvent): boolean => {
    const stateConfig = states[current()];
    if (!stateConfig?.on) return false;

    const transition = stateConfig.on[event];
    if (!transition) return false;

    // For guarded transitions, we can't know without payload
    // Return true if the event exists (guard may still reject)
    return true;
  };

  machine.nextEvents = (): TEvent[] => {
    const stateConfig = states[current()];
    if (!stateConfig?.on) return [];
    return Object.keys(stateConfig.on) as TEvent[];
  };

  machine.reset = (): void => {
    current.set(initial);
  };

  machine.onEnter = (state: TState, callback: EnterCallback<TEvent>): (() => void) => {
    if (!enterListeners.has(state)) {
      enterListeners.set(state, new Set());
    }
    enterListeners.get(state)!.add(callback);

    return () => {
      enterListeners.get(state)?.delete(callback);
    };
  };

  machine.onTransition = (callback: TransitionCallback<TState, TEvent>): (() => void) => {
    transitionListeners.add(callback);
    return () => {
      transitionListeners.delete(callback);
    };
  };

  machine.dispose = (): void => {
    enterListeners.clear();
    transitionListeners.clear();
  };

  return machine as Machine<TState, TEvent>;
}
