# @pyreon/machine

Reactive state machines -- constrained signals with type-safe transitions. Replaces nested booleans with explicit states and events.

## Installation

```bash
bun add @pyreon/machine
```

## Usage

### Basic Machine

```tsx
import { createMachine } from "@pyreon/machine"

const machine = createMachine({
  initial: "idle",
  states: {
    idle: { on: { FETCH: "loading" } },
    loading: { on: { SUCCESS: "done", ERROR: "error" } },
    done: {},
    error: { on: { RETRY: "loading" } },
  },
})

machine()              // "idle" -- reads like a signal
machine.send("FETCH")
machine()              // "loading"
```

### Reactive in JSX

```tsx
{() => machine.matches("idle") && <button onClick={() => machine.send("FETCH")}>Load</button>}
{() => machine.matches("loading") && <Spinner />}
{() => machine.matches("done") && <Results />}
{() => machine.matches("error") && <button onClick={() => machine.send("RETRY")}>Retry</button>}
```

### Guards

Conditional transitions using guard functions:

```ts
const form = createMachine({
  initial: "editing",
  states: {
    editing: {
      on: {
        SUBMIT: { target: "submitting", guard: () => isValid() },
      },
    },
    submitting: { on: { SUCCESS: "done", ERROR: "editing" } },
    done: {},
  },
})
```

### Side Effects with `onEnter`

```ts
machine.onEnter("loading", async () => {
  try {
    await fetchData()
    machine.send("SUCCESS")
  } catch {
    machine.send("ERROR")
  }
})
```

### Transition Listener

```ts
machine.onTransition((from, to, event) => {
  console.log(`${from} -> ${to} via ${event}`)
})
```

### Machine API

```ts
machine()                    // current state (reactive)
machine.send("EVENT")        // trigger transition
machine.send("EVENT", data)  // with payload (for guards)
machine.matches("idle")      // check state (reactive)
machine.matches("idle", "error")  // check multiple states
machine.can("FETCH")         // can this event fire from current state?
machine.nextEvents()         // available events from current state
machine.reset()              // back to initial state
```

### Data Alongside Machines

Machines manage transitions; use signals for data:

```ts
const wizard = createMachine({ initial: "step1", states: { ... } })
const formData = signal({ name: "", email: "" })
```

## API Reference

| Export | Description |
| --- | --- |
| `createMachine(config)` | Create a reactive state machine |
| `Machine` | Machine instance type |
| `MachineConfig` | Configuration type (`initial`, `states`) |
| `StateConfig` | Per-state config with `on` transitions |
| `TransitionConfig` | Transition target with optional `guard` |
| `InferStates<T>` | Infer state union from config |
| `InferEvents<T>` | Infer event union from config |

Use machines for: wizards, auth flows, modals, file uploads, media players, approval workflows.
