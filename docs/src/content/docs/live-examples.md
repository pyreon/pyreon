---
title: Live Examples
description: Mount real .tsx files inline in your docs as live Pyreon components, with optional shared signal state across examples on the same page.
---

The `<Example>` primitive (from `@pyreon/zero-content`) mounts **real `.tsx` files inline as live Pyreon components** — and two examples on the same page can share signal state. Any Pyreon-powered docs site can use it.

## A single example

Reference a real `.tsx` file by path:

```md
<Example file="./examples/effects-log" title="Effect rerunning on signal change" />
```

<Example file="./examples/effects-log" title="Effect rerunning on signal change" />

The component lives at `src/examples/effects-log.tsx` — ordinary Pyreon source, which means it is:

- **typechecked at build** — refactor a `signal` and the docs break loudly, not silently
- **editor-friendly** — jump-to-definition and autocomplete work
- **refactorable** — rename a prop and your IDE updates every reference
- **real code, not a string** — nothing to escape, no sandboxed `srcdoc` blob

## Sharing state across examples

Two `<Example>` calls with the same `share` key receive the **same signal instance**. Interact with one and the change flows reactively to the other — no iframe, no `postMessage`, no coordination in the component code:

```md
<Example file="./examples/bridge-counter-button" share="bridge" />
<Example file="./examples/bridge-counter-readout" share="bridge" />
```

<Example
  file="./examples/bridge-counter-button"
  share="bridge"
/>

<Example
  file="./examples/bridge-counter-readout"
  share="bridge"
/>

Click `bump` in the first; watch the readout in the second. The two components were authored independently, in separate files, with no reference to each other — the docs wire the shared signal at mount time, not the component code.

A signal-based runtime makes this natural: a Pyreon signal is shared by reference, so handing the same one to two mounted components is all it takes. There is no equivalent in an MDX-flavored, VDOM-based docs setup, where sibling components can't share live state without prop drilling or an author-wired provider.

## Writing an example

Each file in `src/examples/` is a normal Pyreon component. To participate in sharing, accept an optional `shared?: Signal<T>` prop and fall back to a local signal when it's absent:

```tsx
import { signal, type Signal } from '@pyreon/reactivity'

export default function Counter(props: { shared?: Signal<number> }) {
  const count = props.shared ?? signal(0)
  return (
    <div>
      <button onClick={() => count.update((n) => n + 1)}>+</button>
      <span>{count()}</span>
    </div>
  )
}
```

With no `share` key in the markdown, `props.shared` is `undefined` and the component uses its own local signal — standalone-usable and bridge-capable, chosen per usage.

## Wiring it up

One line in your `entry-client.ts` registers the example tree:

```ts
import { registerExamples } from '@pyreon/zero-content'

registerExamples(import.meta.glob('./examples/**/*.tsx'))
```

`import.meta.glob` is resolved by Vite at build time relative to where it's called, so your own source tree owns path resolution. The registry handoff lets `@pyreon/zero-content` resolve every `<Example file="…">` path without knowing your layout.

## Why real files, not code strings

| | Code-as-string | `<Example>` (real `.tsx`) |
| --- | --- | --- |
| Type safety | none — silently stale after a refactor | typechecked; `Signal<T>` types propagate to the example |
| Editor support | strings are opaque to the language server | jump-to-definition, autocomplete, rename |
| Escaping | backslashes and newlines need escape passes | source is source — nothing to escape |
| Shared state | iframe sandbox can't share | inline mount; signals connect natively |
