# @pyreon/machine

Reactive state machines as constrained signals — type-safe states and events.

A machine is a Pyreon signal that can only hold a fixed set of values and only transition between them via declared events. Reads (`machine()`) and predicates (`matches(...)` / `can(...)` / `nextEvents()`) are reactive in effects, computeds, and JSX. Everything else — data carried alongside state, side-effect orchestration, async — uses ordinary Pyreon primitives (`signal` / `computed` / `effect`); the machine owns transitions, signals own data. State and event names flow from the config object so `machine.send('TYPO')` is a TypeScript error.

## Install

```bash
bun add @pyreon/machine @pyreon/core @pyreon/reactivity
```

## Quick start

```tsx
import { createMachine } from '@pyreon/machine'

const fetcher = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { FETCH: 'loading' } },
    loading: { on: { SUCCESS: 'done', ERROR: 'error' } },
    done: {},
    error: { on: { RETRY: 'loading' } },
  },
})

fetcher() // 'idle' — reads like a signal
fetcher.send('FETCH') // transition to 'loading'

// Reactive in JSX
function View() {
  return () => (
    <>
      {fetcher.matches('loading') && <Spinner />}
      {fetcher.matches('error') && <button onClick={() => fetcher.send('RETRY')}>Retry</button>}
      {fetcher.matches('done') && <Results />}
    </>
  )
}
```

## API

`createMachine({ initial, states })` returns a callable `Machine<TState, TEvent>`:

| Member                          | Notes                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `machine()`                     | Read current state — reactive in effects / computeds / JSX                      |
| `machine.send(event, payload?)` | Trigger a transition. Silent no-op when no matching `on:` entry.                |
| `machine.matches(...states)`    | True if current state is in the list — reactive                                 |
| `machine.can(event)`            | True if `send(event)` would transition (guards evaluated)                       |
| `machine.nextEvents()`          | Valid event names from the current state — reactive                             |
| `machine.reset()`               | Return to `initial`                                                             |
| `machine.onEnter(state, cb)`    | Callback fires every time `state` is entered. Returns unsubscribe.              |
| `machine.onTransition(cb)`      | Callback fires on any transition with `(from, to, event)`. Returns unsubscribe. |
| `machine.dispose()`             | Remove all listeners and clean up                                               |

## Guards — conditional transitions

```ts
const form = createMachine({
  initial: 'editing',
  states: {
    editing: {
      on: { SUBMIT: { target: 'submitting', guard: () => isValid() } },
    },
    submitting: { on: { SUCCESS: 'done', ERROR: 'editing' } },
    done: {},
  },
})

form.send('SUBMIT') // no-op if !isValid()
form.can('SUBMIT') // true only if guard passes
```

The guard receives the event payload: `guard: (payload?: { force?: boolean }) => isValid() || payload?.force`.

## Listeners — onEnter / onTransition

```ts
const unsubEnter = fetcher.onEnter('loading', (event) => {
  console.log('Entered loading via', event.type, event.payload)
})

const unsubAll = fetcher.onTransition((from, to, event) => {
  analytics.track('state', { from, to, event: event.type })
})

// Later:
unsubEnter()
unsubAll()
// Or wipe everything:
fetcher.dispose()
```

`onEnter` does NOT fire on the initial state — only on subsequent transitions INTO that state. Pair with explicit setup-time work if you need to model entering the initial state as an event.

## Composing with signals

The machine owns transitions; signals own data. Use them together:

```ts
const fetcher = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { FETCH: 'loading' } },
    loading: { on: { SUCCESS: 'done', ERROR: 'error' } },
    done: {},
    error: { on: { RETRY: 'loading' } },
  },
})

const data = signal<User[]>([])
const error = signal<Error | null>(null)

effect(async () => {
  if (!fetcher.matches('loading')) return
  try {
    data.set(await api.fetchUsers())
    fetcher.send('SUCCESS')
  } catch (e) {
    error.set(e as Error)
    fetcher.send('ERROR')
  }
})

fetcher.send('FETCH')
```

## Type inference

State and event names are inferred from the config. The exported `InferStates<T>` and `InferEvents<T>` helpers extract those types when you need to pass the machine around:

```ts
import type { InferStates, InferEvents } from '@pyreon/machine'

type FetcherState = InferStates<typeof fetcher> // 'idle' | 'loading' | 'done' | 'error'
type FetcherEvent = InferEvents<typeof fetcher> // 'FETCH' | 'SUCCESS' | 'ERROR' | 'RETRY'

function logState(s: FetcherState) {
  /* … */
}
```

## Gotchas

- **`send(event)` to an unknown event is a silent no-op**. Use `machine.can(event)` to detect whether the transition would fire (e.g. to disable a button).
- **Guards run on every `can(event)` check** as well as on `send(event)`. Keep guards cheap; for expensive predicates, wrap in `computed` upstream and have the guard read the result.
- **`onEnter` doesn't fire for the initial state** — only subsequent entries. Model "first run" as an explicit event if you need that semantics.
- **The machine does NOT orchestrate side effects.** Use `effect` (or async flow inside an effect) that reads `machine.matches(...)` and reacts. Keeps the machine pure.
- **`dispose()` is final** — after it runs, every method becomes a no-op and listeners are dropped. Don't reuse a disposed machine.
- **States with no `on:` map are terminal** for the framework's purposes — `nextEvents()` returns `[]` and every `send()` is a no-op until something else (a manual `reset()` or another machine) brings it out.

## Documentation

Full docs: [docs.pyreon.dev/docs/machine](https://docs.pyreon.dev/docs/machine) (or `docs/docs/machine.md` in this repo).

## License

MIT
