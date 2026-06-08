import { effect, signal } from '@pyreon/reactivity'

/**
 * Effects demo — runs once at setup then re-runs on every signal
 * change it depended on during the previous pass. Maintains a
 * rolling log of the last 6 values.
 *
 * Replaces the original markdown `<Playground code={` ... `}>` form
 * that shipped `() => log().join('\n')` — that `\n` got unescaped
 * twice (template literal → srcdoc interpolation) and ended as a
 * REAL newline inside a string literal in the iframe `<script>`,
 * throwing `SyntaxError: Invalid or unexpected token`. See PR #1434.
 *
 * The `.tsx` form lets us write `'\n'` naturally — JS string-escape
 * applies once at module evaluation. Real source code, real type
 * checking, real refactor support. The exact problem the new
 * `<Example>` pattern was designed to eliminate.
 */
export default function EffectsLog() {
  const count = signal(0)
  const log = signal<string[]>([])

  effect(() => {
    const c = count()
    log.update((arr) => [...arr, `count = ${c}`].slice(-6))
  })

  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          class="example-btn"
          onClick={() => count.update((n) => n + 1)}
        >
          + Increment
        </button>
        <button
          type="button"
          class="example-btn"
          onClick={() => count.set(0)}
        >
          Reset
        </button>
      </div>
      <div class="example-card">
        <div class="example-muted">effect log (last 6):</div>
        <pre class="example-log">{() => log().join('\n')}</pre>
      </div>
    </div>
  )
}
