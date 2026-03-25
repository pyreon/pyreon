# @pyreon/machine

Reactive state machines for Pyreon. A machine is a constrained signal — it can only hold specific values and transition between them via specific events. Type-safe states and events inferred from the definition.

## Install

```bash
bun add @pyreon/machine
```

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

machine()              // 'idle' — reads like a signal
machine.send('FETCH')  // transition to 'loading'
machine.matches('loading') // true — reactive in effects/JSX

// Reactive in JSX
{() => machine.matches('loading') && <Spinner />}
{() => machine.matches('done') && <Results />}
```

## Guards

Conditional transitions using guard functions:

```tsx
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
```

## API

### `createMachine(config)`

Create a reactive state machine. Config: `initial` (starting state) and `states` (state/event map).

**Returns `Machine`:**

| Property | Description |
| --- | --- |
| `machine()` | Read current state (reactive) |
| `send(event, payload?)` | Trigger a transition |
| `matches(...states)` | Check if in one of the given states (reactive) |
| `can(event)` | Check if event would trigger a valid transition |
| `nextEvents()` | Available events from current state |
| `reset()` | Return to initial state |
| `onEnter(state, callback)` | Fire callback when entering a state |
| `onTransition(callback)` | Fire on any transition |

Use signals alongside machines for data. The machine manages transitions, signals manage data.

## License

MIT
