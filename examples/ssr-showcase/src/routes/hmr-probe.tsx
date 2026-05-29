import { signal } from '@pyreon/reactivity'

/**
 * Dedicated HMR regression probe — exercised ONLY by `e2e/zero-hmr.spec.ts`.
 *
 * Why this file exists: editing a route/page component in `@pyreon/zero`
 * dev used to leave a silently-stale UI until a MANUAL refresh — the Vite
 * plugin emitted a bare `import.meta.hot.accept()` (no callback) which
 * suppressed Vite's reload fallback while re-rendering nothing. The spec
 * mutates the `data-testid="hmr-marker"` text below and asserts the DOM
 * updates IN PLACE (no page reload) while the module-scope `count` signal
 * keeps its value (signal-preserving HMR via `__pyreon_hmr_registry__`).
 *
 * `count` is module-scope on purpose: `@pyreon/vite-plugin` rewrites it to
 * `__hmr_signal(...)`, so a no-reload swap restores its value from the
 * registry. The spec restores the marker text in a `finally`, so this file
 * is byte-identical to its committed state after every run.
 */
const count = signal(0)

export default function HmrProbePage() {
  return (
    <div data-testid="hmr-probe-page">
      <h1>Zero HMR Probe</h1>
      <p data-testid="hmr-marker">MARKER_V1</p>
      <p>
        count: <span data-testid="hmr-count">{() => count()}</span>
      </p>
      <button type="button" data-testid="hmr-inc" onClick={() => count.update((n) => n + 1)}>
        increment
      </button>
    </div>
  )
}
