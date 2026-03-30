import { computed, signal } from '@pyreon/reactivity'

export function Counter() {
  const count = signal(0)
  const doubled = computed(() => count() * 2)

  const increment = () => count.update((n) => n + 1)
  const decrement = () => count.update((n) => n - 1)
  const reset = () => count.set(0)

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
      </div>
    </div>
  )
}
