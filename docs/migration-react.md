# Migrating from React

This guide walks through migrating a React application to Pyreon step by step. You can migrate incrementally — one file at a time — using `@pyreon/react-compat` as a bridge.

## Overview

| Step | What changes |
|---|---|
| 1 | Install Pyreon packages, add Vite plugin |
| 2 | Update tsconfig.json |
| 3 | Replace `react` / `react-dom` imports |
| 4 | Add `()` to all state reads |
| 5 | Remove deps arrays from `useEffect` and `useMemo` |
| 6 | Switch `className` to `class` |
| 7 | Replace `array.map` lists with `For` |
| 8 | Replace `ReactDOM.createRoot` with `mount` |
| 9 | Gradually replace compat hooks with native Pyreon APIs |

## Step 1: Install Packages

```bash
bun add @pyreon/core @pyreon/reactivity @pyreon/runtime-dom @pyreon/react-compat
bun add @pyreon/vite-plugin --dev
```

Remove or keep React packages depending on whether you are doing a full or incremental migration.

## Step 2: Update Vite Config

**Before**

```ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
})
```

**After**

```ts
import { defineConfig } from "vite"
import pyreonPlugin from "@pyreon/vite-plugin"

export default defineConfig({
  plugins: [pyreonPlugin()],
})
```

## Step 3: Update tsconfig.json

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/core"
  }
}
```

## Step 4: Replace Imports

Change all `react` imports to `@pyreon/react-compat`. This is a search-and-replace across your codebase.

**Before**

```ts
import React from "react"
import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { createContext, useContext } from "react"
import { memo, lazy, Suspense } from "react"
```

**After**

```ts
import { useState, useEffect, useMemo, useRef, useCallback } from "@pyreon/react-compat"
import { createContext, useContext } from "@pyreon/react-compat"
import { memo, lazy, Suspense } from "@pyreon/react-compat"
```

You do not need to import the JSX factory — the `jsxImportSource` in tsconfig handles it.

## Step 5: Add () to State Reads

This is the most mechanical change. Every `useState` variable must be called as a function when read.

**Before**

```tsx
function Counter() {
  const [count, setCount] = useState(0)
  const [name, setName] = useState("Alice")

  return (
    <div>
      <p>{name} clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>Click</button>
    </div>
  )
}
```

**After**

```tsx
function Counter() {
  const [count, setCount] = useState(0)
  const [name, setName] = useState("Alice")

  return (
    <div>
      <p>{name()} clicked {count()} times</p>
      <button onClick={() => setCount(count() + 1)}>Click</button>
    </div>
  )
}
```

### Finding all cases

Search for patterns like `{count}`, `{name}`, etc. in JSX and uses of state variables in expressions. A TypeScript compiler error `Type 'Signal<number>' is not assignable to type 'number'` tells you where you forgot to add `()`.

## Step 6: Remove Deps Arrays

**Before**

```tsx
useEffect(() => {
  document.title = `${count} clicks`
}, [count])

const expensive = useMemo(() => {
  return items.filter(i => i.active).length
}, [items])

const handler = useCallback(() => {
  setCount(c => c + 1)
}, [setCount])
```

**After**

```tsx
useEffect(() => {
  document.title = `${count()} clicks`  // auto-tracked
})

const expensive = useMemo(() => {
  return items().filter(i => i.active).length  // auto-tracked
})

const handler = useCallback(() => {
  setCount(c => c + 1)
})  // deps array removed — handler is stable by default
```

Deps arrays are silently ignored in `@pyreon/react-compat`. Removing them is cosmetic but reduces confusion.

## Step 7: Switch className to class

**Before**

```tsx
<div className="container">
<button className={isActive ? "btn active" : "btn"}>
```

**After**

```tsx
<div class="container">
<button class={() => isActive() ? "btn active" : "btn"}>
```

Note: `@pyreon/react-compat` maps `className` to `class` automatically, so this step can be deferred. Switch when you are ready to use Pyreon's reactive class shorthand.

## Step 8: Replace Lists with For

Array.map works in Pyreon but recreates DOM nodes on every signal update. For reactive lists, replace with `For`.

**Before**

```tsx
function TodoList() {
  const [items, setItems] = useState<Todo[]>([])

  return (
    <ul>
      {items.map(todo => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  )
}
```

**After**

```tsx
import { For } from "@pyreon/core"

function TodoList() {
  const [items, setItems] = useState<Todo[]>([])

  return (
    <ul>
      <For
        each={items}
        key={t => t.id}
        children={t => <li>{t.text}</li>}
      />
    </ul>
  )
}
```

## Step 9: Replace ReactDOM Entry

**Before**

```tsx
// main.tsx
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"

ReactDOM.createRoot(document.getElementById("root")!).render(<App />)
```

**After**

```tsx
// main.tsx
import { mount } from "@pyreon/runtime-dom"
import App from "./App"

mount(document.getElementById("root")!, <App />)
```

## Step 10: Migrate to Native Pyreon APIs (Optional)

Once the app works with `@pyreon/react-compat`, you can progressively replace compat APIs with native Pyreon equivalents for better performance and developer experience.

### useState → signal

**Before (compat)**

```tsx
import { useState } from "@pyreon/react-compat"

function Component() {
  const [count, setCount] = useState(0)
  return <span onClick={() => setCount(n => n + 1)}>{count()}</span>
}
```

**After (native)**

```tsx
import { signal } from "@pyreon/reactivity"

function Component() {
  const count = signal(0)
  return <span onClick={() => count.update(n => n + 1)}>{count()}</span>
}
```

### useEffect → effect

**Before (compat)**

```tsx
useEffect(() => {
  const id = setInterval(() => tick(), 1000)
  return () => clearInterval(id)
})
```

**After (native)**

```tsx
import { effect } from "@pyreon/reactivity"

effect(() => {
  const id = setInterval(() => tick(), 1000)
  return () => clearInterval(id)
})
```

### useMemo → computed

**Before (compat)**

```tsx
const doubled = useMemo(() => count() * 2)
```

**After (native)**

```tsx
import { computed } from "@pyreon/reactivity"

const doubled = computed(() => count() * 2)
```

### useContext → native useContext

The API is identical. Just change the import:

```tsx
// Before
import { useContext } from "@pyreon/react-compat"

// After
import { useContext } from "@pyreon/core"
```

## Common Issues

### "count is not a function"

You are using a React `useState` variable as a signal. Make sure you imported `useState` from `@pyreon/react-compat`, not `react`.

### Stale values in event handlers

React developers sometimes see stale closure values because they forget deps arrays. In Pyreon, there are no stale closures — the signal always returns the current value when called. If you see stale values, you are reading the signal outside of a tracking context (e.g., storing `count()` in a local variable at component setup time).

```tsx
// Stale — reads once at setup
const value = count()
onClick={() => console.log(value)}  // always 0

// Correct — reads current value at click time
onClick={() => console.log(count())}
```

### Component renders look wrong after migration

Pyreon components run once. If your component had logic that depended on re-running (e.g., side effects in the render body), extract them into `effect` or `onMount`.

```tsx
// React — runs on every render
function Bad() {
  const [x, setX] = useState(0)
  fetch("/api")  // runs on every render — bad in React too, but works
  return <div>{x}</div>
}

// Pyreon — runs once (correct behavior)
function Good() {
  const x = signal(0)
  onMount(() => {
    fetch("/api").then(r => r.json()).then(data => x.set(data.value))
  })
  return <div>{x()}</div>
}
```

### Third-party React components

Components from React ecosystem libraries (Radix UI, react-table, react-spring, etc.) will not work with Pyreon's JSX runtime. Options:

1. Find a Pyreon-compatible alternative.
2. Render the React component inside an `onMount` using `ReactDOM.createRoot` on a div, and use Pyreon signals to communicate between the Pyreon tree and the React subtree.
3. Keep using React for that part of the UI and migrate around it.

## Before / After Summary

| React | Pyreon |
|---|---|
| `import { useState } from "react"` | `import { useState } from "@pyreon/react-compat"` |
| `const [x, setX] = useState(0)` | same (compat) or `const x = signal(0)` |
| `{x}` in JSX | `{x()}` |
| `useEffect(fn, [deps])` | `useEffect(fn)` or `effect(fn)` |
| `useMemo(fn, [deps])` | `useMemo(fn)` or `computed(fn)` |
| `className="box"` | `class="box"` |
| `items.map(i => <Li key={i.id} />)` | `<For each={items} key={i => i.id} children={i => <Li />} />` |
| `ReactDOM.createRoot(el).render(<App />)` | `mount(el, <App />)` |
| Component re-renders on state change | Component runs once; signals update DOM |
| Deps arrays required | No deps arrays |
| Stale closures possible | No stale closures |
