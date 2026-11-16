import { useHead } from '@pyreon/head'
import { computed, signal } from '@pyreon/reactivity'

export const meta = {
  title: 'Counter — Pyreon Zero',
  description: "See Pyreon's signal-based reactivity in action.",
}

/**
 * The counter for a `--compat` project. Plain Mode (`state()` / `derived()`)
 * is a Pyreon compile-time dialect, and a compat project hands its JSX to the
 * compat runtime instead of the Pyreon compiler, so this version uses signals
 * directly: a signal (or any function) passed as a child stays live.
 */
export default function Counter() {
  useHead({ title: meta.title })

  const count = signal(0)
  const doubled = computed(() => count() * 2)
  const isEven = computed(() => count() % 2 === 0)

  return (
    <>
      <div
        class="page-header"
        style="text-align: center;"
      >
        <span class="badge">Interactive Demo</span>
        <h1 style="margin-top: var(--space-md);">Signal Reactivity</h1>
        <p>
          Fine-grained reactivity with zero virtual DOM. Only the exact text nodes that display
          these values are updated — nothing else re-renders.
        </p>
      </div>

      <div class="counter-demo">
        <div class="counter-display">{count}</div>

        <div class="counter-controls">
          <button
            type="button"
            class="btn btn-secondary"
            onClick={() => count.update((n) => n - 1)}
          >
            -
          </button>
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => count.set(0)}
          >
            Reset
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            onClick={() => count.update((n) => n + 1)}
          >
            +
          </button>
        </div>

        <div class="counter-meta">
          <div>
            count → <strong>{count}</strong>
          </div>
          <div>
            doubled → <strong>{doubled}</strong>
          </div>
          <div>
            isEven → <strong>{() => (isEven() ? 'true' : 'false')}</strong>
          </div>
        </div>
      </div>

      <div
        class="code-block"
        style="max-width: 520px; margin: var(--space-2xl) auto 0;"
      >
        <div class="code-block-header">
          <span>counter.tsx — signals, fully reactive</span>
        </div>
        {/* prettier-ignore */}
        <pre>
          <code>
            <span class="kw">const</span> <span class="fn">count</span> = <span class="fn">signal</span>(<span class="str">0</span>){"\n"}
            <span class="kw">const</span> <span class="fn">doubled</span> = <span class="fn">computed</span>(() =&gt; <span class="fn">count</span>() * <span class="str">2</span>){"\n"}
            {"\n"}
            <span class="cm">{"// Write through the signal:"}</span>{"\n"}
            <span class="fn">count</span>.<span class="fn">update</span>((n) =&gt; n + <span class="str">1</span>){"\n"}
            {"\n"}
            <span class="cm">{"// …and every place that reads it updates ✓"}</span>
          </code>
        </pre>
      </div>
    </>
  )
}
