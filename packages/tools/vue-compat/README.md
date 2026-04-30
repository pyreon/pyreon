# @pyreon/vue-compat

Vue 3 Composition API shim that runs on Pyreon's signal-based reactive engine. Migrate Vue code by swapping the import path.

## Install

```bash
bun add @pyreon/vue-compat
```

## Quick Start

```tsx
// Replace:
// import { ref, computed, watch } from "vue"
// With:
import { ref, computed, watch } from '@pyreon/vue-compat'

function Counter() {
  const count = ref(0)
  const doubled = computed(() => count.value * 2)

  watch(count, (newVal, oldVal) => {
    console.log(`count: ${oldVal} -> ${newVal}`)
  })

  return (
    <div>
      <span>{doubled.value}</span>
      <button onClick={() => count.value++}>Count: {count.value}</button>
    </div>
  )
}
```

### Reactive Objects

```tsx
import { reactive, watchEffect } from '@pyreon/vue-compat'

function UserForm() {
  const form = reactive({ name: '', email: '' })

  watchEffect(() => {
    console.log('form changed:', form.name, form.email)
  })

  return (
    <div>
      <input
        value={form.name}
        onInput={(e) => (form.name = e.currentTarget.value)}
        placeholder="Name"
      />
      <input
        value={form.email}
        onInput={(e) => (form.email = e.currentTarget.value)}
        placeholder="Email"
      />
      <p>
        Hello, {form.name} ({form.email})
      </p>
    </div>
  )
}
```

### Provide / Inject

```tsx
import { ref, provide, inject, defineComponent } from '@pyreon/vue-compat'

const ThemeKey = Symbol('theme')

function ThemeProvider(props: { children: any }) {
  const theme = ref('light')
  provide(ThemeKey, theme)
  return (
    <div>
      <button onClick={() => (theme.value = theme.value === 'light' ? 'dark' : 'light')}>
        Toggle theme
      </button>
      {props.children}
    </div>
  )
}

function ThemedBox() {
  const theme = inject(ThemeKey, ref('light'))
  return <div class={`box-${theme.value}`}>Theme: {theme.value}</div>
}
```

### createApp

```tsx
import { createApp, ref } from '@pyreon/vue-compat'

function App() {
  const message = ref('Hello from Pyreon')
  return <h1>{message.value}</h1>
}

const app = createApp(App)
app.mount('#app')
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

## Composing Pyreon framework components inside vue-compat

Pyreon's framework components (`RouterView`, `PyreonUI`, `FormProvider`, `QueryClientProvider`, …) ship marked with `nativeCompat()` from `@pyreon/core` — vue-compat's JSX runtime detects the marker and routes them through Pyreon's setup frame instead of the compat wrapper. **You don't need to do anything** for the 24 components shipped marked.

If you write your **own** Pyreon-flavored helper that uses `provide()` / `onMount()` / `onUnmount()` / `effect()` at component-body scope and use it in a vue-compat app, mark it explicitly:

```tsx
import { nativeCompat, provide, createContext } from '@pyreon/core'

const MyCtx = createContext<string>('default')

function MyProvider(props: { value: string; children?: unknown }) {
  provide(MyCtx, props.value)
  return props.children as never
}
nativeCompat(MyProvider) // ← required for compat-mode apps
```

Without the marker, the wrapper relocates the body's render context and `provide()` lands in a torn-down context stack — descendants read the default. See [`packages/core/core/src/compat-marker.ts`](../../core/core/src/compat-marker.ts) for details.
