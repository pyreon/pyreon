---
title: Machine
description: Reactive state machines for Pyreon — constrained signals with type-safe transitions.
---

`@pyreon/machine` provides reactive state machines — constrained signals that can only hold specific values and transition between them via specific events. Replace nested booleans with explicit states and type-safe transitions.

<PackageBadge name="@pyreon/machine" href="/docs/machine" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/machine
```

```bash [bun]
bun add @pyreon/machine
```

```bash [pnpm]
pnpm add @pyreon/machine
```

```bash [yarn]
yarn add @pyreon/machine
```

:::

## Quick Start

```tsx
import { createMachine } from '@pyreon/machine'

const machine = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { FETCH: 'loading' } },
    loading: { on: { SUCCESS: 'done', ERROR: 'error' } },
    done: {},
    error: { on: { RETRY: 'loading' } },
  },
})

machine() // 'idle' — reads like a signal
machine.send('FETCH')
machine() // 'loading'
```

<Playground title="State Machine" :height="100">
const state = signal('idle')
const transitions = { idle: { FETCH: 'loading' }, loading: { SUCCESS: 'done', ERROR: 'error' }, done: {}, error: { RETRY: 'loading' } }
const send = (event) => {
  const next = transitions[state()]?.[event]
  if (next) state.set(next)
}

const app = document.getElementById('app')
const ui = h('div', {},
  h('div', { style: { fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' } }, () => 'State: ' + state()),
  h('button', { onClick: () => send('FETCH') }, 'FETCH'),
  h('button', { onClick: () => send('SUCCESS'), style: { marginLeft: '8px' } }, 'SUCCESS'),
  h('button', { onClick: () => send('ERROR'), style: { marginLeft: '8px' } }, 'ERROR'),
  h('button', { onClick: () => send('RETRY'), style: { marginLeft: '8px' } }, 'RETRY'),
)
mount(ui, app)
</Playground>

## Why State Machines?

State machines prevent impossible states. Compare:

```tsx
// ❌ Nested booleans — 16 possible combinations, most invalid
const isLoading = signal(false)
const isError = signal(false)
const isSuccess = signal(false)
const isOpen = signal(false)
// What does isLoading=true + isSuccess=true mean? 🤷

// ✅ State machine — only valid states exist
const dialog = createMachine({
  initial: 'closed',
  states: {
    closed: { on: { OPEN: 'confirming' } },
    confirming: { on: { CONFIRM: 'loading', CANCEL: 'closed' } },
    loading: { on: { SUCCESS: 'success', ERROR: 'error' } },
    success: { on: { CLOSE: 'closed' } },
    error: { on: { RETRY: 'loading', CLOSE: 'closed' } },
  },
})
```

## Reading State

The machine instance is callable — it reads like a signal and is reactive in effects, computeds, and JSX:

```tsx
const machine = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { START: 'running' } },
    running: { on: { STOP: 'idle', PAUSE: 'paused' } },
    paused: { on: { RESUME: 'running', STOP: 'idle' } },
  },
})

// Read current state
machine() // 'idle'

// Reactive in JSX
function StatusBadge() {
  return <span>{() => machine()}</span>
}
```

## Sending Events

Transition between states by sending events:

```tsx
machine.send('START') // idle → running
machine.send('PAUSE') // running → paused
machine.send('RESUME') // paused → running
machine.send('STOP') // running → idle

// With payload
machine.send('SELECT', { id: 42 })

// Invalid events are silently ignored
machine.send('PAUSE') // ignored when in 'idle' — no transition defined
```

## Guards

Use guards for conditional transitions:

```tsx
const form = createMachine({
  initial: 'editing',
  states: {
    editing: {
      on: {
        SUBMIT: { target: 'submitting', guard: () => isValid() },
        SAVE_DRAFT: 'saving',
      },
    },
    submitting: { on: { SUCCESS: 'done', ERROR: 'editing' } },
    saving: { on: { SAVED: 'editing' } },
    done: {},
  },
})

// SUBMIT only transitions if guard returns true
form.send('SUBMIT') // ignored if isValid() is false

// Guards can also receive the event payload
const transfer = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: {
        SEND: { target: 'confirming', guard: (payload) => payload.amount > 0 },
      },
    },
    confirming: { on: { CONFIRM: 'done', CANCEL: 'idle' } },
    done: {},
  },
})

transfer.send('SEND', { amount: 100 }) // guard passes → confirming
transfer.send('SEND', { amount: 0 }) // guard fails → stays idle
```

## Checking State

### `matches()`

Check if the machine is in one or more states — reactive in JSX and effects:

```tsx
machine.matches('loading') // true if in 'loading'
machine.matches('success', 'error') // true if in either

// Reactive rendering
function App() {
  return () => {
    if (machine.matches('idle')) return <button onClick={() => machine.send('FETCH')}>Load</button>
    if (machine.matches('loading')) return <Spinner />
    if (machine.matches('error')) return <ErrorView onRetry={() => machine.send('RETRY')} />
    if (machine.matches('done')) return <DataView />
    return null
  }
}
```

### `can()`

Check if an event would trigger a valid transition from the current state:

```tsx
machine.can('FETCH')   // true if FETCH is defined in current state's transitions

// Disable buttons for invalid actions
<button disabled={!machine.can('SUBMIT')} onClick={() => machine.send('SUBMIT')}>
  Submit
</button>
```

### `nextEvents()`

Get all available events from the current state:

```tsx
machine.nextEvents() // ['FETCH', 'RESET'] — depends on current state

// Useful for command palettes or help dialogs
const availableActions = machine.nextEvents()
```

## Side Effects with `onEnter`

Fire a callback when the machine enters a specific state:

```tsx
const fetchMachine = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { FETCH: 'loading' } },
    loading: { on: { SUCCESS: 'done', ERROR: 'error' } },
    done: {},
    error: { on: { RETRY: 'loading' } },
  },
})

const data = signal(null)
const error = signal(null)

// Side effect — fetch when entering 'loading'
fetchMachine.onEnter('loading', async () => {
  try {
    const result = await fetch('/api/data').then((r) => r.json())
    data.set(result)
    fetchMachine.send('SUCCESS')
  } catch (e) {
    error.set(e)
    fetchMachine.send('ERROR')
  }
})
```

`onEnter` returns an unsubscribe function:

```tsx
const unsub = machine.onEnter('loading', () => { ... })
unsub()  // remove the listener
```

## Transition Listener

React to any transition:

```tsx
machine.onTransition((from, to, event) => {
  console.log(`${from} → ${to} via ${event.type}`)
  analytics.track('state_change', { from, to, event: event.type })
})
```

## Reset

Return to the initial state:

```tsx
machine.reset() // back to 'idle' (or whatever initial was)
```

## Cleanup

Remove all listeners:

```tsx
machine.dispose() // clears all onEnter and onTransition listeners
```

## Type Safety

States and events are inferred from the definition — no manual type annotations needed:

```tsx
const machine = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { FETCH: 'loading', RESET: 'idle' } },
    loading: { on: { SUCCESS: 'done', ERROR: 'error' } },
    done: {},
    error: { on: { RETRY: 'loading' } },
  },
})

machine() // type: 'idle' | 'loading' | 'done' | 'error'
machine.send('FETCH') // ✓ valid event
machine.send('FLY') // TS error — not a valid event
machine.matches('idle') // ✓ valid state
machine.matches('x') // TS error — not a valid state
```

## Real-World Patterns

### Multi-Step Wizard

```tsx
const wizard = createMachine({
  initial: 'step1',
  states: {
    step1: { on: { NEXT: 'step2' } },
    step2: { on: { NEXT: 'step3', BACK: 'step1' } },
    step3: { on: { SUBMIT: 'submitting', BACK: 'step2' } },
    submitting: { on: { SUCCESS: 'done', ERROR: 'step3' } },
    done: {},
  },
})

const formData = signal({ name: '', email: '' })

wizard.onEnter('submitting', async () => {
  try {
    await submitData(formData())
    wizard.send('SUCCESS')
  } catch {
    wizard.send('ERROR')
  }
})

function WizardUI() {
  return () => {
    if (wizard.matches('step1')) return <Step1 onNext={() => wizard.send('NEXT')} />
    if (wizard.matches('step2'))
      return <Step2 onNext={() => wizard.send('NEXT')} onBack={() => wizard.send('BACK')} />
    if (wizard.matches('step3'))
      return <Step3 onSubmit={() => wizard.send('SUBMIT')} onBack={() => wizard.send('BACK')} />
    if (wizard.matches('submitting')) return <Spinner />
    if (wizard.matches('done')) return <Success />
    return null
  }
}
```

### Auth Flow

```tsx
const auth = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { LOGIN: 'authenticating' } },
    authenticating: { on: { SUCCESS: 'authenticated', ERROR: 'idle' } },
    authenticated: { on: { LOGOUT: 'idle' } },
  },
})

const user = signal(null)

auth.onEnter('authenticating', async (event) => {
  try {
    const result = await login(event.payload.email, event.payload.password)
    user.set(result)
    auth.send('SUCCESS')
  } catch {
    auth.send('ERROR')
  }
})

auth.onEnter('idle', () => user.set(null))
```

### File Upload

```tsx
const upload = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { SELECT: 'selected' } },
    selected: { on: { UPLOAD: 'uploading', CANCEL: 'idle' } },
    uploading: { on: { PROGRESS: 'uploading', SUCCESS: 'done', ERROR: 'error' } },
    done: { on: { RESET: 'idle' } },
    error: { on: { RETRY: 'uploading', CANCEL: 'idle' } },
  },
})

const progress = signal(0)
const file = signal(null)
```

## Data Alongside Machines

Machines manage transitions, signals manage data. They compose naturally:

```tsx
// ✅ Signals for data, machine for state
const count = signal(0)
const error = signal<Error | null>(null)

const machine = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { INCREMENT: 'idle', SUBMIT: 'submitting' } },
    submitting: { on: { SUCCESS: 'done', ERROR: 'idle' } },
    done: {},
  },
})

machine.onEnter('idle', (event) => {
  if (event.type === 'INCREMENT') count.update((n) => n + 1)
})
```

## API Reference

### `createMachine(config)`

| Property         | Type                          | Description                        |
| ---------------- | ----------------------------- | ---------------------------------- |
| `config.initial` | `string`                      | Initial state                      |
| `config.states`  | `Record<string, StateConfig>` | State definitions with transitions |

### `Machine` instance

| Method                             | Returns      | Description                                       |
| ---------------------------------- | ------------ | ------------------------------------------------- |
| `machine()`                        | `TState`     | Read current state (reactive)                     |
| `machine.send(event, payload?)`    | `void`       | Send event to trigger transition                  |
| `machine.matches(...states)`       | `boolean`    | Check if in any of the given states (reactive)    |
| `machine.can(event)`               | `boolean`    | Check if event would trigger a transition         |
| `machine.nextEvents()`             | `TEvent[]`   | Available events from current state               |
| `machine.reset()`                  | `void`       | Return to initial state                           |
| `machine.onEnter(state, callback)` | `() => void` | Fire callback on state entry, returns unsubscribe |
| `machine.onTransition(callback)`   | `() => void` | Fire on any transition, returns unsubscribe       |
| `machine.dispose()`                | `void`       | Remove all listeners                              |

### `StateConfig`

```ts
interface StateConfig<TState, TEvent> {
  on?: Record<TEvent, TState | TransitionConfig<TState>>
}

interface TransitionConfig<TState> {
  target: TState
  guard?: (payload?: unknown) => boolean
}
```
