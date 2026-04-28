import { computed, signal } from '@pyreon/reactivity'

export function Counter() {
  const count = signal(0)
  const doubled = computed(() => count() * 2)

  const increment = () => count.update((n) => n + 1)
  const decrement = () => count.update((n) => n - 1)
  const reset = () => count.set(0)
  // Double-click jumps by 10 — used by `e2e/app.spec.ts` to regression-test
  // the React→DOM event-name mapping. `onDoubleClick` must compile down to
  // a listener on the `dblclick` DOM event (NOT `doubleclick`, which the
  // compiler's naive lowercasing produced before the React-name mapping
  // landed).
  const jumpByTen = () => count.update((n) => n + 10)

  return (
    <div class="card">
      <h2>Counter</h2>
      <p class="value">{() => count()}</p>
      <p class="doubled">doubled: {() => doubled()}</p>
      <div class="actions">
        <button type="button" onClick={decrement}>
          −
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
        <button type="button" onClick={increment}>
          +
        </button>
        <button type="button" class="jump" onDoubleClick={jumpByTen}>
          jump 10
        </button>
      </div>
    </div>
  )
}
