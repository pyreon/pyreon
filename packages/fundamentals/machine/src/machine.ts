import { batch, signal } from '@pyreon/reactivity'
import type {
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

// Max eventless ('always') steps in one macrostep — guards an infinite
// always-loop (a config error) instead of hanging.
const MAX_ALWAYS_STEPS = 1000

// Max events processed by ONE top-level send() (the event itself + everything
// queued by listeners/watchers during its run-to-completion drain) — guards an
// infinite send loop the same way MAX_ALWAYS_STEPS guards an always-loop.
const MAX_EVENTS_PER_SEND = 10_000

// Guards are pure predicates — a guard that throws is treated as "denied"
// (no transition) rather than crashing send()/can(). Lets `can(event)` be
// called without a payload against a payload-reading guard, and keeps a
// buggy guard from taking down an event dispatch.
function safeGuard(guard: (payload?: unknown) => boolean, payload?: unknown): boolean {
  try {
    return guard(payload)
  } catch {
    return false
  }
}

function callListener(kind: string, run: () => void): void {
  try {
    run()
  } catch (err) {
    // Reported in production too: swallowing a user callback's error
    // silently would hide a real bug. Not rethrown, so the transition (and
    // every other subscriber) still completes.
    console.error(`[Pyreon] machine: an ${kind} listener threw; the transition continued.`, err)
  }
}

// Every lookup keyed by a caller-controlled name (a state or an event) must
// be an OWN-property lookup. `x in states` / `on[event]` also see
// Object.prototype, so `send('toString')` found a "transition" (the inherited
// function), resolved its `.target` to `undefined`, and moved the machine
// into an undefined state — permanently stuck, no error.
function isStateOf(states: object, name: unknown): boolean {
  return typeof name === 'string' && Object.hasOwn(states, name)
}

function checkTarget(states: object, target: string, stateName: string): void {
  if (!isStateOf(states, target)) {
    throw new Error(
      `[Pyreon] machine: transition target '${target}' (from state '${stateName}') is not defined in states`,
    )
  }
}

/**
 * Validate the initial state and every transition target. A non-existent /
 * typo'd target would otherwise silently `current.set(...)` into a state the
 * machine has no config for, leaving it PERMANENTLY STUCK — `matches(...)`
 * false for every real state, `nextEvents()` empty, every subsequent `send()`
 * a no-op — with no error and no warning. This is the same failure class
 * `initial` is already guarded against, and (unlike TS) it also covers JS
 * consumers.
 *
 * Own-enumerable keys only (what `Object.keys`/`Object.values` saw), walked
 * without building the key/value arrays — this runs on every createMachine.
 */
function validateConfig(
  initial: string,
  states: Record<string, StateConfig<string, string>>,
): void {
  if (!isStateOf(states, initial)) {
    throw new Error(`[Pyreon] machine: initial state '${initial}' is not defined in states`)
  }
  for (const stateName in states) {
    if (!Object.hasOwn(states, stateName)) continue
    const sc = states[stateName] as StateConfig<string, string>
    const on = sc.on as Record<string, TransitionConfig<string> | undefined> | undefined
    if (on) {
      for (const ev in on) {
        if (!Object.hasOwn(on, ev)) continue
        const tr = on[ev]
        if (tr === undefined) continue
        checkTarget(states, typeof tr === 'string' ? tr : tr.target, stateName)
      }
    }
    if (sc.always) {
      const list = Array.isArray(sc.always) ? sc.always : [sc.always]
      for (const tr of list) checkTarget(states, typeof tr === 'string' ? tr : tr.target, stateName)
    }
  }
}

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

  validateConfig(initial, states as Record<string, StateConfig<string, string>>)

  const current = signal<TState>(initial)
  // Listener collections are created on first subscription: most machines
  // never register one, so allocating four Map/Sets per instance up front was
  // pure create cost and retained heap.
  let enterListeners: Map<TState, Set<EnterCallback<TEvent>>> | undefined
  let exitListeners: Map<TState, Set<EnterCallback<TEvent>>> | undefined
  let transitionListeners: Set<TransitionCallback<TState, TEvent>> | undefined
  let doneListeners: Set<EnterCallback<TEvent>> | undefined

  // Synthetic event used for the eventless cascade at creation/reset, where no
  // real event triggered the transition. Listeners registered after creation
  // never observe it; it only fills the callback signature.
  const initEvent = (): MachineEvent<TEvent> => ({ type: '' as TEvent })

  function resolveTransition(event: TEvent, payload?: unknown): TState | null {
    const stateConfig = states[current.peek()]
    if (!stateConfig?.on) return null

    if (!Object.hasOwn(stateConfig.on, event)) return null
    const transition = stateConfig.on[event] as TransitionConfig<TState> | undefined
    if (!transition) return null

    if (typeof transition === 'string') {
      return transition
    }

    // Guarded transition
    if (transition.guard && !safeGuard(transition.guard, payload)) {
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
      if (!t.guard || safeGuard(t.guard, undefined)) return t.target
    }
    return null
  }

  // Perform a single transition: exit(from) → set → transition → enter(to) →
  // done(if final). onExit fires while still in `from` (state-chart order:
  // exit before the state change is observable); onTransition/onEnter after.
  //
  // Every listener call is isolated: a throwing callback is REPORTED and the
  // transition continues. Letting it propagate aborted the step midway — a
  // throwing onExit left the machine in `from` with the event half-applied, a
  // throwing onEnter skipped the remaining listeners, the `always` cascade and
  // onDone — so one buggy subscriber could desynchronise every other one.
  function doTransition(from: TState, to: TState, event: MachineEvent<TEvent>): void {
    const exits = exitListeners?.get(from)
    if (exits) for (const cb of exits) callListener('onExit', () => cb(event))

    current.set(to)

    if (transitionListeners)
      for (const cb of transitionListeners) callListener('onTransition', () => cb(from, to, event))

    const enters = enterListeners?.get(to)
    if (enters) for (const cb of enters) callListener('onEnter', () => cb(event))

    if (doneListeners && states[to]?.final) {
      for (const cb of doneListeners) callListener('onDone', () => cb(event))
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

  // Run-to-completion: an event sent WHILE a macrostep is running (from an
  // onEnter/onExit/onTransition/onDone listener) is queued and processed after
  // the current macrostep finishes. Processing it inline ran the nested
  // transition in the middle of the outer one — later listeners of the outer
  // step then fired against a state the machine had already left, and the
  // outer step's onDone/always-cascade ran from the wrong state.
  let processing = false
  const queue: Array<{ event: TEvent; payload: unknown }> = []

  function processEvent(event: TEvent, payload: unknown): void {
    const target = resolveTransition(event, payload)
    // Unhandled event (or guard rejected) — no transition.
    if (target === null) return
    const machineEvent: MachineEvent<TEvent> = { type: event, payload }
    doTransition(current.peek(), target, machineEvent)
    runAlways(machineEvent)
  }

  machine.send = (event: TEvent, payload?: unknown): TState => {
    if (processing) {
      queue.push({ event, payload })
      // The queued event has not run yet — report the state as it is now.
      return current.peek()
    }
    // Fast path for an unhandled event: no batch, no macrostep.
    if (resolveTransition(event, payload) === null) return current.peek()

    processing = true
    try {
      // Batch the transition + eventless ('always') cascade + queued events so
      // a reactive reader (effect/computed subscribing to `machine()`) settles
      // on the FINAL state and never observes a transient step — the contract
      // the manifest documents ("a transient state is never observed by
      // reactive readers"). Batch defers only signal-subscriber notifications;
      // the per-step onEnter/onExit/onTransition callbacks still fire per step.
      //
      // Run-to-completion across the batch FLUSH: when `batch` exits, effects
      // and `watch` callbacks run synchronously — and may `send()`. `processing`
      // is still true then, so those events are QUEUED; they must be drained
      // too. So loop (one batch per round, FIFO) until a round's flush leaves
      // the queue empty. Clearing the queue here without draining silently
      // dropped every watcher-sent event.
      queue.push({ event, payload })
      let processed = 0
      while (queue.length > 0) {
        batch(() => {
          for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
            if (++processed > MAX_EVENTS_PER_SEND) {
              throw new Error(
                `[Pyreon] machine: more than ${MAX_EVENTS_PER_SEND} events were processed by one send() — likely an infinite send loop (an onEnter/onExit/onTransition listener or watcher re-sending an event on every transition). Last event: '${String(next.event)}'.`,
              )
            }
            processEvent(next.event, next.payload)
          }
        })
      }
    } finally {
      processing = false
      // Only non-empty when a throw aborted the drain; those events belong to
      // an aborted macrostep and must not leak into the next send().
      queue.length = 0
    }
    // The settled state after the event + any eventless ('always') cascade.
    return current.peek()
  }

  // A tracked read plus a comparison. `arguments` instead of a rest parameter:
  // the common one-state call allocates no array.
  machine.matches = function matches(first: TState): boolean {
    const state = current()
    const n = arguments.length
    if (n === 1) return first === state
    for (let i = 0; i < n; i++) if (arguments[i] === state) return true
    return false
  } as (...matchStates: TState[]) => boolean

  // `can(event, payload?)` predicts `send(event, payload)` exactly: it evaluates
  // the guard (throw-safe → denied) with the given payload, or `undefined` if
  // none is passed. Reactive — `current()` subscribes the calling scope; the
  // resolution then reads the same (current) state.
  machine.can = (event: TEvent, payload?: unknown): boolean => {
    current() // reactive subscription
    return resolveTransition(event, payload) !== null
  }

  machine.nextEvents = (): TEvent[] => {
    const stateConfig = states[current()]
    if (!stateConfig?.on) return []
    return Object.keys(stateConfig.on) as TEvent[]
  }

  machine.isFinal = (): boolean => states[current()]?.final === true

  /**
   * Reset to the initial state and re-run its eventless (`always`) cascade.
   *
   * NOTE (deliberate): `reset()` sets the state DIRECTLY — it does NOT fire
   * `onExit(currentState)` or `onEnter(initial)` (only the subsequent `always`
   * cascade fires listeners). So a resource acquired in `onEnter` and released
   * in `onExit` (e.g. the "start a timer on enter, clear it on exit" pattern)
   * is NOT torn down by `reset()`; clean it up explicitly before resetting.
   */
  machine.reset = (): void => {
    // Batched for the same reason as `send` — a reactive reader settles on the
    // final state, never a transient `always` step.
    batch(() => {
      current.set(initial)
      runAlways(initEvent())
    })
  }

  machine.onEnter = (state: TState, callback: EnterCallback<TEvent>): (() => void) => {
    const byState = (enterListeners ??= new Map())
    let set = byState.get(state)
    if (!set) byState.set(state, (set = new Set()))
    set.add(callback)

    return () => {
      enterListeners?.get(state)?.delete(callback)
    }
  }

  machine.onExit = (state: TState, callback: EnterCallback<TEvent>): (() => void) => {
    const byState = (exitListeners ??= new Map())
    let set = byState.get(state)
    if (!set) byState.set(state, (set = new Set()))
    set.add(callback)

    return () => {
      exitListeners?.get(state)?.delete(callback)
    }
  }

  machine.onTransition = (callback: TransitionCallback<TState, TEvent>): (() => void) => {
    ;(transitionListeners ??= new Set()).add(callback)
    return () => {
      transitionListeners?.delete(callback)
    }
  }

  machine.onDone = (callback: EnterCallback<TEvent>): (() => void) => {
    ;(doneListeners ??= new Set()).add(callback)
    return () => {
      doneListeners?.delete(callback)
    }
  }

  machine.dispose = (): void => {
    enterListeners?.clear()
    exitListeners?.clear()
    transitionListeners?.clear()
    doneListeners?.clear()
  }

  // Settle the initial state's eventless ('always') transitions at creation —
  // no listeners exist yet, so this only resolves the reported initial state.
  // Batched so a reader created between machine construction and its first read
  // never observes a transient initial `always` step. Skipped outright when the
  // initial state has no `always` (nothing can fire, so nothing to batch).
  if (states[initial].always) {
    batch(() => {
      runAlways(initEvent())
    })
  }

  return machine as Machine<TState, TEvent>
}
