import { useHead } from "@pyreon/head"
import { computed, signal } from "@pyreon/reactivity"

export const meta = {
  title: "Counter — Pyreon Zero",
  description: "See Pyreon's signal-based reactivity in action.",
}

export default function Counter() {
  useHead({ title: meta.title })

  const count = signal(0)
  const doubled = computed(() => count() * 2)
  const isEven = computed(() => count() % 2 === 0)

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
        {/* Signal auto-call: just write {count} — the compiler adds () for you */}
        <div class="counter-display">{count}</div>

        <div class="counter-controls">
          <button
            type="button"
            class="btn btn-secondary"
            onClick={() => count.update((n) => n - 1)}
          >
            -
          </button>
          <button type="button" class="btn btn-primary" onClick={() => count.set(0)}>
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
          {/* No () needed — signals and computeds are auto-called in JSX */}
          <div>
            count → <strong>{count}</strong>
          </div>
          <div>
            doubled → <strong>{doubled}</strong>
          </div>
          <div>
            isEven → <strong>{isEven() ? "true" : "false"}</strong>
          </div>
        </div>
      </div>

      <div class="code-block" style="max-width: 520px; margin: var(--space-2xl) auto 0;">
        <div class="code-block-header">
          <span>counter.tsx — signal auto-call</span>
        </div>
        <pre>
          <code>
            <span class="kw">const</span> <span class="fn">count</span> ={" "}
            <span class="fn">signal</span>(<span class="str">0</span>)
            <span class="kw">const</span> <span class="fn">doubled</span> ={" "}
            <span class="fn">computed</span>(() =&gt; <span class="fn">count</span>() * <span class="str">2</span>)
            {"\n"}
            <span class="cm">{"// Plain JS — no () needed in JSX:"}</span>
            <span class="tag">&lt;div&gt;</span>
            {"{"}count{"}"} × 2 = {"{"}doubled{"}"}
            <span class="tag">&lt;/div&gt;</span>
            {"\n"}
            <span class="cm">{"// Compiler auto-calls signals for you ✓"}</span>
          </code>
        </pre>
      </div>
    </>
  )
}
