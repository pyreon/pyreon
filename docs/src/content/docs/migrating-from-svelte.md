---
title: Coming from Svelte
description: Svelte 5 runes ($state/$derived/$effect) and Pyreon signals map almost directly — this covers the explicit .set write, JSX instead of .svelte templates, and the zero meta-framework.
---

Svelte 5's runes (`$state`, `$derived`, `$effect`) and Pyreon's signals are the same idea: fine-grained reactivity the compiler wires up. The two shifts coming to Pyreon are **explicit `.set` writes instead of direct mutation** and **JSX instead of `.svelte` files**. A `@pyreon/svelte-compat` layer exists for incremental migration.

## Reactivity: explicit `.set`, not direct mutation

Svelte 5's `$state` lets you mutate the variable directly — the compiler rewrites the assignment into a reactive update. Pyreon's `signal` is a callable with an explicit `.set`:

```svelte
<!-- Svelte 5 -->
<script>
  let count = $state(0)
  const doubled = $derived(count * 2)
</script>
<button onclick={() => count++}>{count} / {doubled}</button>
```

```tsx
// Pyreon
function Counter() {
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  return <button onClick={() => count.update((c) => c + 1)}>{() => `${count()} / ${doubled()}`}</button>
}
```

The reactivity is equivalent; you read `count()` and write `count.set(...)` / `count.update(...)` instead of mutating `count` in place.

## API map

| Svelte 5 | Pyreon | Notes |
| --- | --- | --- |
| `$state(v)` | `signal(v)` | read `s()`, write `s.set()` / `s.update()` |
| `$derived(expr)` | `computed(() => expr)` | memoized derived value |
| `$effect(fn)` | `effect(fn)` | auto-tracked side effect |
| `$props()` | component `props` | read `props.x` in reactive scope |
| `writable(v)` (store) | `signal(v)` / `@pyreon/store` | store subscriptions become signal reads |
| `onMount` | `onMount` | same |
| `onDestroy` | `onUnmount` / cleanup return | return cleanup from `onMount` |
| `setContext` / `getContext` | `provide` / `useContext` | reactive contexts return an accessor |
| SvelteKit | `@pyreon/zero` | fs-routing, SSR/SSG/ISR, adapters |

## Templates → JSX

```svelte
<!-- Svelte -->
{#if show}<p>Hi</p>{/if}
{#each rows as row (row.id)}<li>{row.label}</li>{/each}
<button class:active={isOn} onclick={toggle}>{label}</button>
```

```tsx
// Pyreon
{() => (show() ? <p>Hi</p> : null)}   // or <Show when={show}><p>Hi</p></Show>
<For each={rows} by={(row) => row.id}>{(row) => <li>{row.label}</li>}</For>
<button class={{ active: isOn() }} onClick={toggle}>{() => label()}</button>
```

`{#if}` → `<Show>` / ternary; `{#each ... (key)}` → keyed `<For>`; `on:click` / `onclick` → `onClick`; `class:active` → `class={{ active: ... }}`; `bind:value` → `value={s} onInput={(e) => s.set(e.currentTarget.value)}`; `{x}` → `{() => x()}`.

## Incremental migration

`@pyreon/svelte-compat` runs Svelte-shaped APIs on the Pyreon runtime — port a component tree gradually. One contract worth knowing: a compat store subscribed in a component body must be plain-subscriber-backed, not a Pyreon signal, or it freezes after the first write (the compat layer handles its own stores correctly). See its docs page for the limitation matrix.

## Cheat sheet

- `$state(v)` → `signal(v)`; write `s.set()` / `s.update()` (no direct `count++`)
- `$derived` → `computed`; `$effect` → `effect`; `$props()` → `props`
- `onMount` → `onMount`; `onDestroy` → `onUnmount` (+ cleanup return)
- `{#if}` → `<Show>` / ternary; `{#each}` → `<For each={s} by={...}>`; `bind:value` → `value`+`onInput`
- `writable` store → `signal` / `@pyreon/store`; SvelteKit → `@pyreon/zero`

If you're fluent in Svelte 5 runes, the reactivity transfers immediately; the porting work is `.svelte` markup → JSX, which the directive map above makes mechanical.

## Related

- [Svelte Compat](/docs/svelte-compat) · [Why Pyreon](/docs/why-pyreon)
- [Reactivity in Depth](/docs/guides/reactivity-in-depth)
