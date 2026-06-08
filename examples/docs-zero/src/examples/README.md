# Pyreon docs examples

Real `.tsx` files referenced by `<Example file="./examples/X" />` in
the docs markdown. The Pyreon-native replacement for string-blob
`<Playground code={`...`} />` — every example here is a typechecked,
refactorable, real Pyreon component.

## Authoring contract

Each example is a `.tsx` file that:
- Exports a default function (the Pyreon component)
- Optionally accepts a `shared?: Signal<T>` prop — when set, the
  component uses the provided signal instead of allocating its own
  local one

```tsx
import { signal, type Signal } from '@pyreon/reactivity'

export default function MyExample(props: { shared?: Signal<number> }) {
  const count = props.shared ?? signal(0)
  return (
    <div>
      <button onClick={() => count.update(n => n + 1)}>+</button>
      <span>{() => count()}</span>
    </div>
  )
}
```

## Referenced from markdown

```md
<Example file="./examples/counter" />
```

The `.tsx` extension is optional. Path is relative to the consumer
glob (registered at app startup via `registerExamples`).

## Cross-Example shared state

Multiple `<Example>` calls with the same `share="key"` get the
SAME signal — interactions in one reactively flow to others on the
same page. Unique to Pyreon (no MDX-flavor framework has this):

```md
<Example file="./examples/counter-button" share="cnt" />
<Example file="./examples/counter-readout" share="cnt" />
```

Click the button in the first example → the readout in the second
updates. No iframe, no postMessage — pure signal-graph reactivity.
