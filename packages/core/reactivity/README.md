# @pyreon/reactivity

Signal-based fine-grained reactivity primitives for the Pyreon framework.

## Install

```bash
bun add @pyreon/reactivity
```

## Quick Start

```ts
import { signal, computed, effect, batch } from '@pyreon/reactivity'

const count = signal(0)
const doubled = computed(() => count() * 2)

effect(() => {
  console.log('doubled:', doubled())
})

batch(() => {
  count.set(1)
  count.set(2)
})
// logs "doubled: 4" once
```

## API

### Signals

- **`signal<T>(initial: T, options?): Signal<T>`** -- Callable getter with `.set(value)` and `.update(fn)` methods. Pass `{ name }` for debug labels (auto-injected by `@pyreon/vite-plugin` in dev mode).
- **`computed<T>(fn, options?): Computed<T>`** -- Derived signal that recomputes lazily when dependencies change.
- **`cell<T>(initial: T): Cell<T>`** -- Lightweight reactive cell.

### Effects

- **`effect(fn): Effect`** -- Runs `fn` and re-runs it whenever its tracked dependencies change.
- **`onCleanup(fn)`** -- Registers a cleanup function inside an effect. Runs before re-execution and on disposal.
- **`renderEffect(fn): Effect`** -- Like `effect`, but scheduled for render timing.
- **`watch(source, callback, options?): WatchOptions`** -- Watches a reactive source and calls back on change.
- **`setErrorHandler(handler)`** -- Sets a global error handler for effect errors.

### Batching

- **`batch(fn)`** -- Groups multiple signal writes; subscribers notified once at the end.
- **`nextTick(): Promise<void>`** -- Resolves after the current batch of updates flushes.

### Tracking

- **`runUntracked(fn)`** -- Runs `fn` without tracking any signal reads.
- **`untrack(fn)`** -- Alias for `runUntracked`.

### Scopes

- **`effectScope(): EffectScope`** -- Creates a scope that collects effects for bulk disposal.
- **`getCurrentScope(): EffectScope | undefined`** -- Returns the active effect scope.
- **`setCurrentScope(scope)`** -- Manually sets the current effect scope.

### Selectors and Resources

- **`createSelector(source)`** -- Creates an efficient selector for keyed comparisons.
- **`createResource(fetcher): Resource<T>`** -- Wraps an async data source in a reactive resource.

### Stores

- **`createStore(initial)`** -- Creates a deeply reactive store object.
- **`isStore(value): boolean`** -- Checks whether a value is a reactive store.
- **`reconcile(target, source)`** -- Efficiently patches a store to match a new value.

## License

MIT
