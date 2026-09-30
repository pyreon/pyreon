import { useHead } from "@pyreon/head"
import { derived, state } from "@pyreon/core/plain"

export const meta = {
  title: "Counter — Pyreon Zero",
  description: "See Pyreon's signal-based reactivity in action.",
}

export default function Counter() {
  useHead({ title: meta.title })

  // Plain Mode: reactive state reads and writes like ordinary variables —
  // the compiler turns them into fine-grained signals.
  let count = state(0)
  const doubled = derived(count * 2)
  const isEven = derived(count % 2 === 0)

  return (
    <>
      <div class="page-header" style="text-align: center;">
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
            onClick={() => { count-- }}
          >
            -
          </button>
          <button type="button" class="btn btn-primary" onClick={() => { count = 0 }}>
            Reset
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            onClick={() => { count++ }}
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
            isEven → <strong>{isEven ? "true" : "false"}</strong>
          </div>
        </div>
      </div>

      <div class="code-block" style="max-width: 520px; margin: var(--space-2xl) auto 0;">
        <div class="code-block-header">
          <span>counter.tsx — plain JavaScript, fully reactive</span>
        </div>
        <pre>
          <code>
            <span class="kw">let</span> <span class="fn">count</span> ={" "}
            <span class="fn">state</span>(<span class="str">0</span>)
            <span class="kw">const</span> <span class="fn">doubled</span> ={" "}
            <span class="fn">derived</span>(<span class="fn">count</span> * <span class="str">2</span>)
            {"\n"}
            <span class="cm">{"// Write it like a normal variable:"}</span>
            <span class="fn">count</span>++
            {"\n"}
            <span class="cm">{"// …and every place that reads it updates ✓"}</span>
          </code>
        </pre>
      </div>
    </>
  )
}
