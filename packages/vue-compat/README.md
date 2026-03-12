# @pyreon/vue-compat

Vue 3 Composition API shim that runs on Pyreon's signal-based reactive engine. Migrate Vue code by swapping the import path.

## Install

```bash
bun add @pyreon/vue-compat
```

## Quick Start

```ts
// Replace:
// import { ref, computed, watch } from "vue"
// With:
import { ref, computed, watch } from "@pyreon/vue-compat"

function useCounter() {
  const count = ref(0)
  const doubled = computed(() => count.value * 2)
  watch(count, (newVal, oldVal) => {
    console.log(`count: ${oldVal} -> ${newVal}`)
  })
  return { count, doubled }
}
```

## Key Differences from Vue

- **No virtual DOM.** Pyreon uses fine-grained reactivity -- no diffing, no re-renders.
- **Components run once** (setup phase only).
- **`reactive()` uses Pyreon's store proxy** with deep signal wrapping.
- **`readonly()` is strict** -- setting any property (including symbols) throws an error.
- **`provide` / `inject` uses Pyreon's context system** -- fully isolated per component tree.

## API

### Reactivity: Refs

- **`ref(value)`** -- returns `{ value }` with reactive `.value`.
- **`shallowRef(value)`** -- shallow reactive ref (no deep tracking).
- **`triggerRef(ref)`** -- force subscribers to re-run.
- **`isRef(val)`** -- type guard.
- **`unref(val)`** -- unwrap a ref or return value as-is.
- **`toRef(obj, key)`** -- create a ref bound to an object property.
- **`toRefs(obj)`** -- convert all properties to refs.

### Reactivity: Computed

- **`computed(fn)`** -- read-only computed ref.
- **`computed({ get, set })`** -- writable computed ref.

### Reactivity: Objects

- **`reactive(obj)`** -- deep reactive proxy (Pyreon store).
- **`shallowReactive(obj)`** -- shallow reactive proxy.
- **`readonly(obj)`** -- read-only proxy that throws on writes.
- **`toRaw(proxy)`** -- unwrap to the original object.

### Watchers

- **`watch(source, callback, options?)`** -- watch a ref, getter, or reactive object. Supports `immediate` and `deep`.
- **`watchEffect(fn)`** -- auto-tracking effect, returns stop handle.

### Lifecycle Hooks

- **`onMounted(fn)`** / **`onBeforeMount(fn)`**
- **`onUnmounted(fn)`** / **`onBeforeUnmount(fn)`**
- **`onUpdated(fn)`**

### Dependency Injection

- **`provide(key, value)`** -- provide a value to descendants.
- **`inject(key, defaultValue?)`** -- inject a value from an ancestor.

### Application

- **`createApp(component, props?)`** -- create an app instance with `.mount(el)` and `.unmount()`.
- **`defineComponent(setup)`** -- wrapper for type inference (returns setup as-is).
- **`nextTick()`** -- wait for the next microtask.

### Utilities

- **`h` / `Fragment`** -- JSX runtime.
- **`batch(fn)`** -- coalesce multiple signal writes.
