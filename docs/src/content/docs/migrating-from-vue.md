---
title: Coming from Vue
description: Vue's Composition API and Pyreon's signals are close cousins — this maps ref/reactive/computed/watch to signal/computed/effect, and Vue templates to JSX.
---

Vue 3's Composition API (`ref`, `computed`, `watchEffect`) and Pyreon's signals share the same reactive core: fine-grained dependency tracking, derived values, and effects. The two big shifts are **callable signals instead of `.value`** and **JSX instead of SFC templates**. There's also a `@pyreon/vue-compat` layer (near-full public-API parity) for incremental migration.

## Reactivity: `()` to read, `.set` to write — no `.value`

Vue's `ref` is read and written through `.value`. Pyreon's `signal` is called to read and uses `.set` to write:

```ts
// Vue
const count = ref(0)
count.value            // read
count.value = 1        // write
const doubled = computed(() => count.value * 2)
```

```ts
// Pyreon
const count = signal(0)
count()                // read
count.set(1)           // write
const doubled = computed(() => count() * 2)
```

`reactive({...})` (deep reactive objects) maps to either individual signals or `@pyreon/store` / `@pyreon/state-tree` for structured state.

## API map

| Vue | Pyreon | Notes |
| --- | --- | --- |
| `ref(v)` | `signal(v)` | read `s()`, write `s.set()` (no `.value`) |
| `reactive(obj)` | signals / `@pyreon/store` | per-field signals or a store |
| `computed(fn)` | `computed(fn)` | Vue reads `.value`; Pyreon calls `c()` |
| `watchEffect(fn)` | `effect(fn)` | auto-tracked side effect |
| `watch(src, cb)` | `watch(src, cb)` / `effect` | Pyreon ships `watch` too |
| `onMounted` | `onMount` | same lifecycle slot |
| `onUnmounted` | `onUnmount` / cleanup return | return cleanup from `onMount` |
| `provide` / `inject` | `provide` / `useContext` | reactive contexts return an accessor |
| Pinia | `@pyreon/store` | composition stores, singleton by id |
| Vue Router | `@pyreon/router` | loaders, guards, typed search params |
| Nuxt | `@pyreon/zero` | fs-routing, SSR/SSG/ISR, adapters |

## Templates → JSX

Vue's SFC template directives become JSX expressions:

```html
<!-- Vue -->
<button :class="{ active: isOn }" @click="toggle">{{ label }}</button>
<li v-for="row in rows" :key="row.id">{{ row.label }}</li>
<p v-if="show">Hi</p>
```

```tsx
// Pyreon
<button class={{ active: isOn() }} onClick={toggle}>{() => label()}</button>
<For each={rows} by={(row) => row.id}>{(row) => <li>{row.label}</li>}</For>
{() => (show() ? <p>Hi</p> : null)}   // or <Show when={show}><p>Hi</p></Show>
```

`{{ x }}` → `{() => x()}`; `:prop` → `prop={...}`; `@event` → `onEvent`; `v-if` → `<Show>` or a ternary; `v-for` → keyed `<For>`; `v-model` → `value={s} onInput={(e) => s.set(e.currentTarget.value)}`.

## A side-by-side

```ts
// Vue (script setup)
const count = ref(0)
const doubled = computed(() => count.value * 2)
// template: <button @click="count++">{{ count }} / {{ doubled }}</button>
```

```tsx
// Pyreon
function Counter() {
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  return <button onClick={() => count.update((c) => c + 1)}>{() => `${count()} / ${doubled()}`}</button>
}
```

## Incremental migration

`@pyreon/vue-compat` provides Vue-shaped APIs running on the Pyreon runtime, so you can port a Vue app piece by piece. See its docs page for the per-API limitation matrix.

## Cheat sheet

- `ref(v)` → `signal(v)`; read `s()` (not `.value`), write `s.set()`
- `computed` → `computed` (call `c()`, not `.value`); `watchEffect` → `effect`
- `onMounted`/`onUnmounted` → `onMount` (+ cleanup return)
- `provide`/`inject` → `provide`/`useContext`
- `v-if` → `<Show>` / ternary; `v-for` → `<For each={s} by={...}>`; `v-model` → `value`+`onInput`
- Pinia → `@pyreon/store`; Vue Router → `@pyreon/router`; Nuxt → `@pyreon/zero`

The reactive model is familiar from day one; the real porting work is template-to-JSX, which is mechanical once the directive map above is in hand.

## Related

- [Vue Compat](/docs/vue-compat) · [Why Pyreon](/docs/why-pyreon)
- [Reactivity in Depth](/docs/guides/reactivity-in-depth)
