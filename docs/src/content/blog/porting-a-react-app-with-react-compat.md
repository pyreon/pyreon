---
title: "Bring your React app. Change two config lines. Go fine-grained one component at a time"
description: "@pyreon/react-compat runs the React components you already have on Pyreon’s runtime, with near-full public-API parity with React 19. Then convert them to signals one at a time, starting where it pays. What carries over, what changes, and the one behaviour to plan around."
date: 2027-01-25
slug: porting-a-react-app-with-react-compat
tags: [react, javascript, migration, webdev]
cover: /blog/covers/porting-a-react-app-with-react-compat.png
---

A rewrite is the most expensive way to find out whether a framework is worth it. You spend three weeks porting, and only then do you learn the answer.

`@pyreon/react-compat` gives you a cheaper path. Change two lines of config, run the React components you already have on Pyreon's runtime, then convert them to native Pyreon one at a time, starting with the components where fine-grained updates pay off most. Your app keeps working the whole way, and the payoff is real: on a TodoMVC-shaped benchmark, native Pyreon toggles 1,000 todos about **2.4× faster than React 19** and clears them 3–4× faster (synthetic, author-run, Apple M3 Max; [benchmarks](/docs/benchmarks)).

Here is the full route: what runs as-is, what behaves differently (including one difference you must plan for), how a converted component lives inside a compat app, and the moment you switch compat off and let the compiler take over. The compat layer has near-full public-API parity with React 19. It is a migration path, not React, and every place it differs is listed below.

## Step 1: point React at the compat layer

```bash
npm install @pyreon/react-compat @pyreon/vite-plugin
```

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon({ compat: 'react' })],
})
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/react-compat"
  }
}
```

With `compat: 'react'`, the plugin aliases `react`, `react/jsx-runtime`, `react-dom` and `react-dom/client` to `@pyreon/react-compat` and its `/dom` entry. It also renames `className` and `htmlFor` to `class` and `for` by walking the parsed JSX, never by text replacement. Framework files from `@pyreon/*` keep their real runtime. Your components stay untouched.

Prefer explicit imports? The mapping is one to one:

```tsx
import { useState, useEffect, memo } from '@pyreon/react-compat'
import { createRoot } from '@pyreon/react-compat/dom'
```

## Step 2: know what runs as-is

The compat layer runs React's **value-and-re-render model**, not Pyreon's run-once model. `useState` returns a value, not a getter. The component body re-runs when state changes. Hooks are positional. `useEffect`, `useMemo` and `useCallback` honour their dependency arrays, and stale closures behave exactly as they do in React. This ports unchanged:

```tsx
const [count, setCount] = useState(0)
const doubled = useMemo(() => count * 2, [count])

useEffect(() => {
  const id = setInterval(() => setCount((prev) => prev + 1), 1000)
  return () => clearInterval(id)
}, [])
```

The surface covers React 19's public API: `useReducer`, `useRef`, `useId`, `useSyncExternalStore`, `useImperativeHandle`, `useActionState`, `useOptimistic`, `use`, `useLayoutEffect`, `useInsertionEffect`, plus `forwardRef`, `memo`, `lazy`, `Suspense`, `createContext`, `createPortal`, `cloneElement`, `Children`, `StrictMode` and `Profiler`. We call that **near-full public-API parity**. Here is where the "near" lives.

> **A rewrite is the most expensive way to find out whether a framework is worth it.**

## Step 3: know what differs

| behaviour | React | `@pyreon/react-compat` |
| --- | --- | --- |
| nested child state when an **ancestor** re-renders | preserved by reconciliation | **reset**: the child subtree is rebuilt, so `useState`/`useRef` return to their initial values and `useEffect([])` fires again; `memo` does not prevent this |
| class components | full lifecycle | stubs: `setState`/`forceUpdate` warn and do nothing, lifecycle methods never run, `render()` returns `null` |
| `useTransition`, `useDeferredValue`, `startTransition`, `flushSync` | defer work | synchronous pass-throughs; there is no concurrent mode |
| `useLayoutEffect`, `useInsertionEffect` | run in the commit phase, after DOM mutations | run synchronously right after the component body, in React's order (insertion, then layout); passive `useEffect` runs in a microtask after them. There is no separate commit phase. |
| DOM on re-render | diffed | the component's subtree is replaced; tests must re-query nodes after a state change |
| `version` | the React version | `19.0.0-pyreon` |

**Plan for the first row.** Here's the shape that catches people:

```tsx
// <Editor> holds its own draft in useState.
// Under compat, that draft resets on every count change.
function Parent() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>{count}</button>
      <Editor />
    </div>
  )
}
```

In React, `<Editor>` keeps its draft. Under compat, clicking the button rebuilds `<Editor>` and the draft is gone. The fix is to lift that state into `Parent` and pass it down as `value`/`onChange`. Before you ship anything, search your app for components that hold meaningful local state under a parent that re-renders often: forms, editors, open/closed panels.

**Third-party libraries** sort into three groups:

- **Built only on public hooks** (form helpers, debounce hooks, simple input controllers): generally work.
- **Framework-agnostic core** (`zustand/vanilla`, `xstate`, `nanostores`): work when you use that core directly.
- **Built on React internals or scheduler tricks**: don't. The package README names `zustand/react`'s `useStore`, the heavier `react-aria` composables, `@xyflow/react`, and virtual lists that subscribe through `useSyncExternalStore` fed by `useLayoutEffect`.

## Step 4: convert one component

While everything still re-renders React-style, you get the compat model, not Pyreon's. The payoff arrives when a component moves to signals. Pick a leaf component that renders a lot and holds little cross-component state.

The Pyreon MCP server's `migrate_react` tool does the mechanical part. Here is its real output for a small React `TodoList`:

```text
Changes applied (7):
- Line 4: useState → signal: todos
- Line 5: useState → signal: filter
- Line 6: useMemo → computed (auto-tracks deps)
- Line 8: useEffect → effect (auto-tracks deps)
- Line 13: className → class
- Line 14: onChange on <select> → onInput (native DOM events)
- Line 1: Removed React import

Remaining issues (manual fix needed):
- Line 19: Array.map() in JSX is not reactive in Pyreon. Use <For> for efficient keyed list rendering.
```

Now read the code it hands back. The tool rewrites declarations and leaves the **reads** to you: `todos.filter(...)` must become `todos().filter(...)`, the leftover `setFilter(...)` call becomes `filter.set(...)`, and the destructured `{ initial }` parameter stays. Here that destructure is harmless, because `initial` is read once to seed the signal.

Then run the MCP `validate` tool on the result. It flagged two things: the destructured props (`props-destructured`) and the `.map()` in JSX (`array-map-jsx`). It did not flag the uncalled `todos.filter`; TypeScript catches that one. So the workflow is: tool for the first draft, type-checker and validator to finish the job.

### Running a converted component inside the compat app

One fact shapes this step: **while `compat: 'react'` is on, the Pyreon JSX compiler skips your files.** Everything goes through the compat JSX runtime, so a converted component gets no compiler help. That means two things:

1. Write reactive reads as explicit accessors, `{() => count()}` and `value={() => filter()}`, because nothing adds the call for you.
2. Wrap the component in `nativeCompat()`, so the compat runtime mounts it through Pyreon's own `h()` instead of a React-style re-render shell. Without the marker, `provide()`, `onMount`, `onUnmount` and `effect` in the body run outside Pyreon's setup frame and break on re-render.

```tsx
import { signal, computed } from '@pyreon/reactivity'
import { For, nativeCompat } from '@pyreon/core'

type Todo = { id: number; text: string; status: 'open' | 'done' }

export const TodoList = nativeCompat(function TodoList(props: { initial: Todo[] }) {
  const todos = signal(props.initial)
  const filter = signal<'all' | Todo['status']>('all')
  const visible = computed(() =>
    todos().filter((t) => filter() === 'all' || t.status === filter()),
  )

  return (
    <div class="todos">
      <select
        value={() => filter()}
        onInput={(e) => filter.set(e.currentTarget.value as Todo['status'])}
      >
        <option value="all">All</option>
        <option value="done">Done</option>
      </select>
      <p>{() => `${visible().length} shown`}</p>
      <ul>
        <For each={visible} by={(t) => t.id}>
          {(t) => <li>{t.text}</li>}
        </For>
      </ul>
    </div>
  )
})
```

This component runs once. A change to `filter` updates the count text and the keyed list without calling the function again, and its React-style parent never hears about it.

We checked that composition against the compat runtime on today's `main`: a `nativeCompat` child holding a signal, mounted under a `useState` parent. A signal write updated only the child's text, with zero parent re-renders. **Then the parent re-rendered, and the child's signal went back to its initial value.** The ancestor rule from Step 3 applies to converted children too, because the parent still rebuilds its subtree.

So convert from the leaves up, and keep long-lived state out of components that sit under a re-rendering parent. A module-level signal or a `@pyreon/store` store survives the rebuild.

### Framework components ship marked

`RouterProvider`, `RouterView`, `FormProvider`, `Form`, `QueryClientProvider`, `Toaster`, `ErrorBoundary`, `Suspense` and the other framework providers and boundaries already carry the marker. You can use Pyreon's router, forms and query inside a compat app today. Only **your own** Pyreon-style helpers that call `provide()`, `onMount` or `effect` need `nativeCompat()`. Pure render components without those calls don't.

> **Change two lines of config. Keep shipping. Convert where it pays.**

## Step 5: switch compat off and let the compiler in

When no React-style components remain, remove `compat: 'react'` and set `jsxImportSource` back to `@pyreon/core`. Now the compiler runs on every file. Signal reads in JSX wire straight to the text node or attribute that uses them, static subtrees become cloned templates, and the `{() => …}` accessors you wrote can stay or go: both compile to the same binding. `nativeCompat()` does nothing outside compat apps, so the markers can stay too.

This is where you see Pyreon's model end to end: [components run once](/blog/components-run-once), and an update touches only the node that shows the changed value.

Two React habits to retire at this point. The [reactivity rules](/docs/reactivity-rules) cover both in full:

- **Don't destructure props.** `function Card({ title })` captures `title` once. Read `props.title` where you use it, or use `splitProps`.
- **Early returns run once.** `if (loading()) return <Spinner />` pins the component to whichever branch the first run took. Use `<Show when={() => loading()}>` instead.

## Plan around these

- **One switch for the whole app.** `compat: 'react'` applies to all your files, so converted components run without compiler help until compat is off.
- **Converted children under a re-rendering parent lose state** when that parent re-renders. That's the current compat model, and it's the most likely source of migration bugs.
- **Class components don't run.** Convert them before you expect them to render.
- **No concurrent rendering.** Code that relies on `useTransition` deferring work needs a different approach.
- **Library support is case by case.** We haven't run a broad sweep of the React ecosystem. If a library that uses only public hooks breaks, open an issue with a minimal reproduction and we'll dig in.
- **No compat-mode benchmark is published**, so judge Pyreon's speed on converted components, not on an app still running under compat.

## Start your port

```bash
npm create @pyreon/zero@latest
```

Answer "Migrating from another framework?" with React (or pass `--compat react`) to start a new app with compat already wired, or add the two config lines above to the app you have.

- Every hook, its exact semantics and the migration checklist: [@pyreon/react-compat docs](/docs/react-compat) and [Migrating from React](/docs/migrating-from-react)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Questions, ideas, a bug: open an issue on [GitHub](https://github.com/pyreon/pyreon/issues), where every answer stays findable for the next person.
