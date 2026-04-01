---
title: 'Reactivity Rules'
description: What is reactive and what is static in Pyreon — the one page you need to understand.
---

# Reactivity Rules

Pyreon components run **once**. Unlike React (which re-renders the entire function), Pyreon executes your component function a single time during setup. Reactivity happens at the individual expression level through signals and the compiler.

This page explains exactly what's reactive and what's static.

## The Core Rule

**Signal reads inside reactive scopes re-evaluate when the signal changes. Signal reads outside reactive scopes evaluate once and become static.**

A "reactive scope" is:
- An `effect()` callback
- A `computed()` callback
- A `() =>` wrapper in JSX (compiler-generated or manual)
- A `renderEffect()` callback (internal)

## DOM Text Children — Reactive

Signal calls in JSX text positions are automatically wrapped by the compiler:

```tsx
const name = signal('World')

function Hello() {
  return <div>Hello {name()}</div>
  // Compiler output: <div>Hello {() => name()}</div>
  // ✓ Updates when name changes
}
```

Each text expression gets its own independent binding. In a list:

```tsx
<For each={items} by={r => r.id}>
  {r => <li>{r.name()} - {r.email()}</li>}
</For>
// ✓ r.name() changing does NOT re-evaluate r.email()
// Each text node has its own _bind
```

## DOM Attributes — Reactive

Signal calls in DOM attributes are wrapped by the compiler:

```tsx
<div class={active() ? 'on' : 'off'} />
// Compiler wraps: class={() => active() ? 'on' : 'off'}
// ✓ Updates when active changes
```

Static attributes are baked into the HTML template at compile time:

```tsx
<div class="static" id="header" />
// No wrapping needed — baked into _tpl("<div class=\"static\" id=\"header\"></div>")
```

## Component Props — Reactive (via compiler)

The compiler wraps signal reads in component props with `_rp()`:

```tsx
<MyComponent title={name()} count={total()} />
// Compiler output:
// <MyComponent title={_rp(() => name())} count={_rp(() => total())} />
// ✓ title updates when name changes
// ✓ count updates when total changes
```

**Important**: access props via `props.title` inside the component — don't destructure:

```tsx
// ✗ BAD — destructuring captures the value once (static)
function Bad({ title }) {
  return <div>{title}</div>  // never updates
}

// ✓ GOOD — props.title is a getter (reactive)
function Good(props) {
  return <div>{props.title}</div>  // updates when title changes
}
```

## Context — Reactive vs Static

Pyreon has two context types:

```tsx
// Static context — value captured once
const ThemeCtx = createContext<Theme>(defaultTheme)
const theme = useContext(ThemeCtx) // Theme object, static reference

// Reactive context — returns accessor
const ModeCtx = createReactiveContext<'light' | 'dark'>('light')
const getMode = useContext(ModeCtx) // () => 'light' | 'dark'
getMode() // call it to read — reactive in effects/JSX
```

Rule: if the value can change, use `createReactiveContext`. If it's set once (like a theme config object), use `createContext`.

## Effects — Reactive

Effects automatically track all signal reads inside them:

```tsx
const count = signal(0)
const doubled = computed(() => count() * 2) // ✓ re-computes when count changes

effect(() => {
  console.log(count())  // ✓ re-runs when count changes
  console.log(doubled()) // ✓ also tracked
})
```

## What Is NOT Reactive

### Variables assigned from signals at setup time

```tsx
function MyComponent(props) {
  const name = props.name  // ✗ captured once — static
  const value = count()    // ✗ captured once — static

  return <div>{name}</div> // never updates
}
```

### Destructured props

```tsx
function MyComponent({ name, count }) {
  // ✗ name and count are captured values, not getters
  return <div>{name} - {count}</div> // never updates
}
```

Use `splitProps` if you need to separate props:

```tsx
function MyComponent(props) {
  const [local, rest] = splitProps(props, ['name'])
  // ✓ local.name is still a getter — reactive
  return <div {...rest}>{local.name}</div>
}
```

### Conditional logic outside reactive scopes

```tsx
function MyComponent(props) {
  // ✗ This runs once — the condition is evaluated at setup time
  if (props.variant === 'dark') {
    // This block either runs or doesn't, once
  }

  // ✓ Use Show for reactive conditions
  return (
    <Show when={() => props.variant === 'dark'}>
      <DarkContent />
    </Show>
  )
}
```

## Quick Reference

| Expression | Reactive? | Why |
|-----------|-----------|-----|
| `<div>{count()}</div>` | ✓ | Compiler wraps text children |
| `<div class={active() ? 'a' : 'b'} />` | ✓ | Compiler wraps attributes with calls |
| `<Comp title={name()} />` | ✓ | Compiler wraps with `_rp()` |
| `props.title` in JSX | ✓ | Getter property (from `_rp`) |
| `const x = props.title` | ✗ | Captured once at setup |
| `const { title } = props` | ✗ | Destructured = static |
| `effect(() => count())` | ✓ | Effect tracks signals |
| `computed(() => a() + b())` | ✓ | Computed tracks signals |
| `const x = count()` at setup | ✗ | Evaluated once, stored |
| `<Show when={() => x()}>` | ✓ | Explicit accessor |
| `<For each={items} by={...}>` | ✓ | Keyed reactive list |
| `items().map(...)` | ✗ | Use `<For>` instead |

## Common Mistakes

### Using `.map()` instead of `<For>`

```tsx
// ✗ Re-creates all elements when array changes
<div>{items().map(item => <li>{item.name()}</li>)}</div>

// ✓ Only updates changed items
<For each={items} by={item => item.id}>
  {item => <li>{item.name()}</li>}
</For>
```

### Using ternary instead of `<Show>`

```tsx
// ✗ Both branches evaluated, no conditional mounting
<div>{isOpen() ? <Modal /> : null}</div>

// ✓ Modal only mounts when isOpen is true
<Show when={isOpen}>
  <Modal />
</Show>
```

### Reading a signal to pass as static value

```tsx
// ✗ Reads count() once, passes static number
<ProgressBar value={count()} max={100} />

// The compiler actually fixes this — _rp(() => count()) makes it reactive.
// But if you store it in a variable first:
const current = count()  // ✗ static
<ProgressBar value={current} max={100} />  // never updates
```
