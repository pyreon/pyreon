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
    'machine.send(event, payload?) — trigger transitions',
    'machine.matches(...states) — check current state against one or more values',
    'machine.can(event) — check if a transition is available from current state',
    'Guards with optional payload for conditional transitions',
  ],
  api: [
    {
      name: 'createMachine',
      kind: 'function',
      signature: '<S extends string, E extends string>(config: MachineConfig<S, E>) => Machine<S, E>',
      summary:
        'Create a reactive state machine. The returned machine reads like a signal (`machine()` returns the current state string) and transitions via `machine.send(event, payload?)`. States and events are type-safe — TypeScript infers the union from the config object. Guards enable conditional transitions with typed payloads. No built-in context or effects — use Pyreon signals and `effect()` alongside the machine for data and side effects.',
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
        'Expecting `machine.send()` to return the new state — it returns void; read the state with `machine()` after sending',
        'Calling `machine.set()` — machines are constrained signals, they do not expose `.set()`. State changes only happen through `machine.send(event)`',
        'Using a machine for data storage — machines only hold the current state string. Use regular signals alongside the machine for associated data',
        'Forgetting guard payloads — `machine.send("LOGIN")` without the required payload silently fails the guard',
      ],
      seeAlso: ['Machine', 'MachineConfig'],
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
  ],
})
