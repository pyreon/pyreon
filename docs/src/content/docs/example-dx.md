---
title: Live examples
description: The Pyreon-native docs DX — real .tsx files mounted inline, with cross-example signal bridging.
---

# Live examples — the new DX

Pyreon's docs use a primitive no other framework's docs can: **examples are real `.tsx` files in the repo, mounted inline as Pyreon components, with optional shared signal state across examples on the same page**.

The bug catalog from this session pointed straight at why string-blob `<Playground code={` ... `}>` was the wrong shape. This page shows what the replacement looks like in practice.

## A single example

The simplest case: reference a real `.tsx` file by path.

<Example file="./examples/effects-log" title="Effect rerunning on signal change" />

The component above lives at [`src/examples/effects-log.tsx`](https://github.com/pyreon/pyreon/blob/main/docs/src/examples/effects-log.tsx). It's real Pyreon source code:

- typechecked at build (refactor `signal` → docs break loudly, not silently)
- editor-friendly (jump-to-definition works, autocomplete works)
- refactorable (rename a prop and IDE updates every reference)
- no string-blob escape passes (`'\n'` is just `'\n'` in source)

That's the contract that prevents bugs like [PR #1434](https://github.com/pyreon/pyreon/pull/1434) — where `\n` got unescaped twice through nested template literals and ended as a raw newline inside a string literal in the iframe `<script>`, throwing `SyntaxError`. The new shape makes that bug structurally impossible.

## Two examples sharing a signal — the killer DX

Multiple `<Example>` calls with the same `share="key"` get the **same shared signal**. Interactions in one reactively flow to the other. No iframe, no `postMessage`, no string coordination. Pure Pyreon signal graph.

<Example
  file="./examples/bridge-counter-button"
  share="bridge"
/>

<Example
  file="./examples/bridge-counter-readout"
  share="bridge"
/>

Click `bump` in the first example. Watch the readout in the second one. **The two components were authored independently, in separate files, with no reference to each other.** The docs framework wires the shared signal at mount time — not the component code.

This is the architectural opportunity Pyreon's signal-based runtime opens up that no MDX-flavor framework can replicate. Vue and React's runtimes have no equivalent for "two sibling components share live state without prop drilling or a Provider context wired by the author." Pyreon signals are GLOBAL by reference — sharing one across mounts is what they're built for.

## What's in `src/examples/`?

Each `.tsx` file is a normal Pyreon component. It optionally accepts a `shared?: Signal<T>` prop to participate in the bridge:

```tsx
import { signal, type Signal } from '@pyreon/reactivity'

export default function Counter(props: { shared?: Signal<number> }) {
  const count = props.shared ?? signal(0)
  return (
    <div>
      <button onClick={() => count.update(n => n + 1)}>+</button>
      <span>{() => count()}</span>
    </div>
  )
}
```

When no `share` prop is passed in the markdown, `props.shared` is `undefined` and the component falls back to a local signal. Standalone-usable, bridge-capable — author chooses per usage.

## How it's wired

A single line in the consumer's `entry-client.ts`:

```ts
import { registerExamples } from '@pyreon/zero-content'
registerExamples(import.meta.glob('./examples/**/*.tsx'))
```

Vite's `import.meta.glob` is resolved at COMPILE time relative to where it's called — so the consumer's source tree owns the path resolution. The registry handoff lets `@pyreon/zero-content` look up examples without knowing the consumer's layout.

## What this fixes from the bug catalog

| Bug class | Example | How `<Example>` eliminates it |
|---|---|---|
| String-encoded code | [#1434](https://github.com/pyreon/pyreon/pull/1434) — `\n` double-unescape SyntaxError | Code is a real `.tsx` module, never a string |
| No typechecking | Stale examples after framework refactor | TypeScript types over `Signal<T>` propagate to examples |
| Iframe sandbox | Demos can't share state | Pyreon mounts inline, signals connect natively |
| Editor blindness | Refactor doesn't update example code | LSP sees example source as code, not strings |

## What's deferred (future PRs)

- **Markdoc-style tag syntax** for prose pages — would eliminate the directive parser bugs (`:::code-group` space-vs-no-space etc.)
- **Pyreon-Twoslash** — inline type display in code blocks driven by `@pyreon/compiler`'s existing AST analysis
- **Pages-as-`.tsx`** for reactive prose ("you currently have N items")

This page is the foundation. The `<Example>` primitive ships now; the other layers stack on top later.
