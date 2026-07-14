import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/machine',
  title: 'State Machines',
  tagline:
    'Reactive state machines — constrained signals with type-safe transitions',
  description:
    'Lightweight state machine library built on Pyreon signals. A machine is a constrained signal — it can only hold values from the configured state set and can only transition between them via named events. Guards enable conditional transitions with optional payloads. There is no built-in context or side-effect system — use existing Pyreon signals alongside the machine for data and effects. The machine reads like a signal and subscribes like one, making it natural in JSX and reactive scopes.',
  category: 'universal',
  longExample: `import { createMachine } from '@pyreon/machine'

// Define states and transitions — type-safe:
const machine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: { FETCH: 'loading' },
    },
    loading: {
      on: {
        SUCCESS: 'done',
        ERROR: 'error',
      },
    },
    done: {},
    error: {
      on: { RETRY: 'loading' },
    },
  },
})

// Read state — works like a signal:
machine()              // 'idle'

// Transition via events:
machine.send('FETCH')  // → 'loading'
machine.send('SUCCESS') // → 'done'

// Query capabilities:
machine.matches('done')          // true
machine.matches('idle', 'done')  // true — matches any of the listed states
machine.can('RETRY')             // false — not in 'error' state
machine.nextEvents()             // [] — 'done' has no transitions

// Guards — conditional transitions:
const auth = createMachine({
  initial: 'loggedOut',
  states: {
    loggedOut: {
      on: {
        LOGIN: {
          target: 'loggedIn',
          guard: (creds: { token: string }) => creds.token.length > 0,
        },
      },
    },
    loggedIn: {
      on: { LOGOUT: 'loggedOut' },
    },
  },
})

auth.send('LOGIN', { token: 'abc' }) // guard passes → 'loggedIn'
auth.send('LOGIN', { token: '' })    // guard fails → stays 'loggedOut'

// Use in JSX — reactive:
const Status = () => (
  <div>
    {() => machine.matches('loading') && <Spinner />}
    {() => machine.matches('error') && <ErrorMessage />}
    {() => machine.matches('done') && <Results />}
  </div>
)`,
  features: [
    'createMachine({ initial, states }) — constrained signal with typed transitions',
    'machine() reads state reactively like a signal',
    'machine.send(event, payload?) — trigger a transition; returns the settled state',
    'machine.matches(...states) — check current state against one or more values',
    'machine.can(event, payload?) — predicts send() exactly (evaluates the guard, throw-safe)',
    'Guards with optional payload for conditional transitions (throw → denied)',
    'Eventless (always) transitions — transient/condition states that resolve synchronously',
    'Final states — isFinal() + onDone() for terminal states',
    'Lifecycle listeners — onEnter / onExit / onTransition / onDone',
  ],
  api: [
    {
      name: 'createMachine',
      kind: 'function',
      signature: '<S extends string, E extends string>(config: MachineConfig<S, E>) => Machine<S, E>',
      summary:
        'Create a reactive state machine. The returned machine reads like a signal (`machine()` returns the current state string) and transitions via `machine.send(event, payload?)`. States and events are type-safe — TypeScript infers the union from the config object. Guards enable conditional transitions with typed payloads. Beyond named events, states support eventless `always` transitions (transient/condition states that resolve synchronously), `final: true` terminal states (`isFinal()` + `onDone()`), and full lifecycle listeners (`onEnter` / `onExit` / `onTransition` / `onDone`). `send(event, payload?)` returns the settled state (after any `always` cascade), and `can(event, payload?)` predicts `send` exactly — both evaluate guards throw-safely (a guard that throws denies the transition rather than crashing). No built-in context or effects — use Pyreon signals and `effect()` alongside the machine for data and side effects.',
      example: `const traffic = createMachine({
  initial: 'red',
  states: {
    red:    { on: { NEXT: 'green' } },
    green:  { on: { NEXT: 'yellow' } },
    yellow: { on: { NEXT: 'red' } },
  },
})

traffic()            // 'red' (reactive)
traffic.send('NEXT') // 'green'
traffic.matches('green') // true
traffic.can('NEXT')  // true`,
      mistakes: [
        'Treating `machine.can(event)` (no payload) as "is this event declared?" — it now PREDICTS `send` exactly by evaluating the guard (throw-safe → denied), so a guarded event with no/invalid payload reports `false`',
        'Calling `machine.set()` — machines are constrained signals, they do not expose `.set()`. State changes only happen through `machine.send(event)`',
        'Using a machine for data storage — machines only hold the current state string. Use regular signals alongside the machine for associated data',
        'Forgetting guard payloads — `machine.send("LOGIN")` without the required payload silently fails the guard',
      ],
      seeAlso: ['Machine', 'MachineConfig'],
    },
    {
      name: 'Eventless (always) transitions',
      kind: 'function',
      signature: 'states.<state>.always?: TransitionConfig | TransitionConfig[]',
      summary:
        'A state may declare `always` transitions that fire SYNCHRONOUSLY the moment the state is entered (and for the initial state at creation / on `reset()`). The first unguarded entry — or the first whose guard passes — wins, then the new state\'s `always` is re-evaluated, cascading until none fire. Guards receive NO payload (the transition is eventless), so they read external signals instead. Use for transient / condition states — e.g. enter `check`, then branch to `pass` or `fail` based on a computed value, without an intermediate visible state. An always-loop (a state that always re-targets itself) throws after 1000 steps instead of hanging.',
      example: `const score = signal(0)
const m = createMachine({
  initial: 'check',
  states: {
    // transient: resolves immediately to pass/fail based on the signal
    check: { always: [{ target: 'pass', guard: () => score() >= 50 }, 'fail'] },
    pass: {},
    fail: {},
  },
})
m() // 'pass' or 'fail' — 'check' is never observed`,
      mistakes: [
        'Expecting an `always` guard to receive a payload — eventless transitions have none; read external signals in the guard',
        'A self-targeting unconditional `always` (`{ always: "self" }`) — infinite loop; throws after 1000 steps',
        'Putting a catch-all FIRST in an `always` array — order matters; the first matching entry wins, so list specific guarded targets before an unguarded fallback',
      ],
      seeAlso: ['createMachine'],
    },
    {
      name: 'Machine.onExit / onEnter / onTransition / onDone',
      kind: 'function',
      signature: 'onExit(state, cb) | onEnter(state, cb) | onTransition(cb) | onDone(cb) => () => void',
      summary:
        'Lifecycle listeners. On each transition they fire in state-chart order: `onExit(from)` (while the machine still reads `from`) → `onTransition(from, to, event)` → `onEnter(to)` (machine now reads `to`) → `onDone(event)` if `to` is a `final` state. Each returns an unsubscribe function; `dispose()` removes all. `onExit` pairs with `onEnter` for setup/teardown per state — e.g. start a timer on enter, clear it on exit (the idiomatic alternative to a built-in delayed transition).',
      example: `const m = createMachine({
  initial: 'idle',
  states: { idle: { on: { GO: 'busy' } }, busy: { on: { STOP: 'idle' } } },
})
m.onEnter('busy', () => { const id = setInterval(poll, 1000); cleanup = () => clearInterval(id) })
m.onExit('busy', () => cleanup())`,
      mistakes: [
        'Assuming `onExit` fires AFTER the state changed — it fires while the machine still reads the state being left (state-chart exit-before-enter order)',
        'Using `onEnter`/`onExit` for derived data — listeners are for side effects; for data derived from state use a `computed()` reading `machine()`',
      ],
      seeAlso: ['createMachine'],
    },
    {
      name: 'Final states (final / isFinal / onDone)',
      kind: 'function',
      signature: 'states.<state>.final?: boolean — machine.isFinal(): boolean — machine.onDone(cb)',
      summary:
        'Mark a terminal state with `final: true`. `machine.isFinal()` reads reactively true while the machine is in any final state (use it in JSX / effects), and `machine.onDone(cb)` listeners fire whenever a final state is entered (by event OR by an `always` cascade), receiving the triggering event. Final states model "the machine is done" — e.g. a wizard\'s `complete` state or a fetch\'s terminal `success`/`failure`.',
      example: `const m = createMachine({
  initial: 'active',
  states: { active: { on: { FINISH: 'done' } }, done: { final: true } },
})
m.onDone((e) => console.log('finished via', e.type))
m.isFinal()      // false
m.send('FINISH')
m.isFinal()      // true → onDone fired`,
      mistakes: [
        'Expecting a final state to block further `send()` — Pyreon does not freeze final states; if a final state declares `on` transitions they still fire. Omit `on` for true terminals',
      ],
      seeAlso: ['createMachine'],
    },
    {
      name: 'Machine.matches / nextEvents / reset / dispose',
      kind: 'function',
      signature:
        'matches(...states: S[]) => boolean — nextEvents() => E[] — reset() => void — dispose() => void',
      summary:
        'The instance query + control surface (all reactive where noted). `matches(...states)` — reactive; true when the current state is ANY of the given (a variadic OR: `matches("loading", "error")`). `nextEvents()` — reactive; the current state\'s DECLARED `on` event keys (does NOT evaluate guards and does NOT include eventless `always`). `reset()` — set the state back to `initial` and re-run the initial `always` cascade. `dispose()` — remove ALL lifecycle listeners (`onEnter`/`onExit`/`onTransition`/`onDone`) and clean up.',
      example: `m.matches('loading', 'error')  // in loading OR error (reactive)
m.nextEvents()                 // ['FETCH', 'CANCEL'] — declared events from here
m.reset()                      // back to initial (+ its always cascade)
m.dispose()                    // drop all listeners`,
      mistakes: [
        '`matches("a", "b")` is an OR, not an AND — it is true when the current state is `a` OR `b`. A machine is in exactly one state, so an AND across two states is never true.',
        'Reading `nextEvents()` as "events that would currently SUCCEED" — it returns the current state\'s DECLARED `on` keys WITHOUT evaluating guards, and excludes eventless `always`. Use `can(event, payload?)` to test whether a specific event would actually transition.',
        'Expecting `reset()` to land on the LITERAL `initial` when that state has an `always` — reset re-runs the initial cascade, so a transient initial resolves to its cascade target (never the transient state itself).',
        'Expecting `dispose()` to stop or freeze the machine — it only removes listeners; `send()` still transitions the state afterward (now silently). Drop your references to let it GC.',
      ],
      seeAlso: ['createMachine'],
    },
  ],
  gotchas: [
    {
      label: 'No context',
      note: 'Unlike XState, Pyreon machines have no built-in context. Use regular signals alongside the machine for associated data — the machine handles the state transitions, signals handle the data.',
    },
    {
      label: 'Guard failures are silent',
      note: 'If a guard returns false, the transition simply does not happen — no error is thrown, no event is emitted. Check `machine.can(event)` before sending if you need to handle the rejection.',
    },
    {
      label: 'Signal compatibility',
      note: 'The machine reads like a signal (`machine()`) and subscribes like one — it works in `effect()`, `computed()`, and JSX expression thunks without special handling.',
    },
    {
      label: 'Eventless transitions resolve synchronously',
      note: '`always` transitions fire during the SAME `send()` call (and at creation / `reset()`), cascading until none apply — a transient state is never observed by `machine()` or by reactive readers. Guards receive no payload; read external signals. A self-looping `always` throws after 1000 steps.',
    },
    {
      label: 'send returns state; can predicts it; guards are throw-safe',
      note: '`send(event, payload?)` returns the SETTLED state (after the `always` cascade), or the unchanged state for an unhandled event / rejected guard. `can(event, payload?)` predicts `send` exactly — it evaluates the guard. Guards are throw-safe: a guard that throws (e.g. reading a property of a missing payload) DENIES the transition rather than crashing `send`/`can`.',
    },
  ],
})
