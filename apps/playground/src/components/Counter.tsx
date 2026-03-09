import { h } from "@pyreon/core"
import { signal, computed } from "@pyreon/reactivity"

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
        <button onClick={decrement}>−</button>
        <button onClick={reset}>Reset</button>
        <button onClick={increment}>+</button>
      </div>
    </div>
  )
}
