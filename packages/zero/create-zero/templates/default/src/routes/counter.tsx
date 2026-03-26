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
        <div class="counter-display">{() => count()}</div>

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
          <div>
            count() → <strong>{() => count()}</strong>
          </div>
          <div>
            doubled() → <strong>{() => doubled()}</strong>
          </div>
          <div>
            isEven() → <strong>{() => (isEven() ? "true" : "false")}</strong>
          </div>
        </div>
      </div>

      <div class="code-block" style="max-width: 520px; margin: var(--space-2xl) auto 0;">
        <div class="code-block-header">
          <span>counter.tsx</span>
        </div>
        <pre>
          <code>
            <span class="kw">import</span> {"{"} signal, computed {"}"} <span class="kw">from</span>{" "}
            <span class="str">"@pyreon/reactivity"</span>
            <span class="kw">const</span> <span class="fn">count</span> ={" "}
            <span class="fn">signal</span>(<span class="str">0</span>)<span class="kw">const</span>{" "}
            <span class="fn">doubled</span> = <span class="fn">computed</span>(() =&gt;{" "}
            <span class="fn">count</span>() * <span class="str">2</span>)
            <span class="cm">{"// Just reference the signal in JSX —"}</span>
            <span class="cm">{"// only this text node updates"}</span>
            <span class="tag">&lt;span&gt;</span>
            {"{"}count{"}"}
            <span class="tag">&lt;/span&gt;</span>
          </code>
        </pre>
      </div>
    </>
  )
}
