# @pyreon/vue-compat

Vue 3 Composition API shim — write Vue-style code that runs on Pyreon's reactive engine.

`@pyreon/vue-compat` provides the Vue 3 Composition API surface (`ref`, `shallowRef`, `computed`, `reactive`, `shallowReactive`, `readonly`, `shallowReadonly`, `toRef`, `toRefs`, `toRaw`, `toValue`, `unref`, `isRef`, `isReactive`, `isReadonly`, `isProxy`, `markRaw`, `triggerRef`, `watch`, `watchEffect`, lifecycle hooks `onMounted` / `onUnmounted` / `onUpdated` / `onBeforeMount` / `onBeforeUnmount`, `nextTick`, `provide` / `inject`, `defineComponent`, `defineAsyncComponent`, `createApp`, `effectScope` / `getCurrentScope` / `onScopeDispose`, error/render-track hooks, `<Teleport>`, `<KeepAlive>`, `<Transition>`) all running on Pyreon's reactive engine. **This is a runtime shim, not Vue** — it covers what code imports, NOT the Single-File Component compiler. `.vue` files require a separate SFC compiler.

## Install

```bash
bun add @pyreon/vue-compat
```

## Quick start

```tsx
import { ref, computed, watch, onMounted } from '@pyreon/vue-compat'

function Counter() {
  const count = ref(0)
  const doubled = computed(() => count.value * 2)

  watch(count, (next, prev) => {
    console.log(`count: ${prev} → ${next}`)
  })

  onMounted(() => {
    console.log('mounted')
  })

  return (
    <div>
      <p>Count: {count.value}, doubled: {doubled.value}</p>
      <button onClick={() => count.value++}>+1</button>
    </div>
  )
}
```

## Subpath exports

| Subpath                              | Surface                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `@pyreon/vue-compat`                 | Full Composition API surface — see API table below                                             |
| `@pyreon/vue-compat/jsx-runtime`     | JSX automatic runtime (`jsx`, `jsxs`, `Fragment`)                                              |
| `@pyreon/vue-compat/jsx-dev-runtime` | Dev variant — same runtime                                                                     |

## API surface

| Category         | Exports                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Refs             | `ref`, `shallowRef`, `triggerRef`, `isRef`, `unref`, `toValue`, `toRef`, `toRefs`             |
| Computed         | `computed` (getter form + writable `{ get, set }` form)                                       |
| Reactive         | `reactive`, `shallowReactive`, `readonly`, `shallowReadonly`, `toRaw`, `markRaw`, `isReactive`, `isReadonly`, `isProxy` |
| Watchers         | `watch`, `watchEffect`, `WatchOptions`                                                         |
| Lifecycle        | `onMounted`, `onUnmounted`, `onUpdated`, `onBeforeMount`, `onBeforeUnmount`, `onErrorCaptured`, `onRenderTracked`, `onRenderTriggered` |
| Scheduling       | `nextTick`                                                                                     |
| DI               | `provide`, `inject`                                                                            |
| Components       | `defineComponent`, `defineAsyncComponent`, `createApp(App, props?)`                            |
| Scope            | `effectScope`, `getCurrentScope`, `onScopeDispose`                                             |
| Built-ins        | `Teleport`, `KeepAlive`, `Transition`                                                          |
| JSX              | `h`, `Fragment`                                                                                |

## Drop-in compat mode

`@pyreon/vite-plugin` can alias every `vue` import to this package:

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
export default { plugins: [pyreon({ compat: 'vue' })] }
```

`tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/vue-compat"
  }
}
```

## Scope

This is a **runtime** shim. It covers what code imports at runtime — the same boundary `@pyreon/solid-compat` draws around Solid's compiler.

- ✅ Composition API — `ref`, `computed`, `reactive`, `watch`, lifecycle, `provide` / `inject`, `effectScope`
- ✅ `defineComponent` (typed) + `defineAsyncComponent`
- ✅ `createApp(component, props)` — mount via `.mount(selector)`
- ✅ Built-in components — `Teleport`, `KeepAlive`, `Transition`
- ❌ `.vue` Single-File Component compiler
- ❌ `<script setup>` syntax (compiler construct)
- ❌ Options API class-component lifecycle (`data`, `methods`, `computed` block, `created`, `beforeDestroy`, …)
- ❌ Template directives (`v-if`, `v-for`, `v-model`) — use JSX equivalents

Components are plain functions returning JSX that run on Pyreon's reactive engine.

## Gotchas

- **`.value` reads/writes work** because Pyreon signals wrap a value getter/setter to match Vue's ref shape.
- **`reactive(obj)` returns a Proxy** that delegates to Pyreon signals — mutating `obj.x = 5` triggers subscribers as Vue does.
- **`watch` deps are tracked automatically** for function sources. For an array of sources, the watcher fires when any one changes.
- **`createApp(App).mount(selector)`** maps to Pyreon's `mount()` — returns an app instance with `.unmount()`.
- **Lifecycle hooks fire ONCE** per component instance (run-once model). Vue's render-driven re-fires (`onUpdated`) translate to per-subscription effects under the hood — the visible effect is the same for most use cases.

## Documentation

Full docs: [docs.pyreon.dev/docs/vue-compat](https://docs.pyreon.dev/docs/vue-compat) (or `docs/src/content/docs/vue-compat.md` in this repo).

## License

MIT
