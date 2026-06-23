import { type Signal } from '@pyreon/reactivity'
import { useStorage } from '@pyreon/storage'

/**
 * The live counterpart to the `useStorage` snippet on the Storage docs
 * page — a REAL `@pyreon/storage` widget, not a plain in-memory `signal`.
 *
 * Both values are backed by `localStorage`: a stored value IS a signal, so
 * reading it in JSX is reactive AND writing it persists. Reload the page and
 * your choices survive; open this page in a second tab and they sync live
 * (via the native `storage` event). "Reset" calls `.remove()` — clears
 * storage and falls back to the default.
 *
 * The `shared` prop is part of the `<Example>` contract; this example has no
 * cross-mount signal to bridge, so it's accepted and ignored.
 */
export default function ReactiveStorage(_props: { shared?: Signal<unknown> }) {
  // Distinctive keys so this demo doesn't collide with other examples.
  const theme = useStorage('docs-rs-theme', 'light')
  const count = useStorage('docs-rs-count', 0)

  return (
    <div class="example-col" data-testid="reactive-storage">
      <div
        style={() =>
          `padding: 12px; border-radius: 8px; transition: background 0.3s, color 0.3s; background: ${
            theme() === 'dark' ? '#1a1a2e' : '#f8f9fa'
          }; color: ${theme() === 'dark' ? '#e2e8f0' : '#1a1a2e'};`
        }
      >
        <div>
          Theme: <strong data-testid="rs-theme">{() => theme()}</strong>
        </div>
        <div>
          Visits stored: <strong data-testid="rs-count">{() => count()}</strong>
        </div>
        <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button
            type="button"
            onClick={() => theme.set(theme() === 'light' ? 'dark' : 'light')}
          >
            Toggle theme
          </button>
          <button type="button" onClick={() => count.update((n) => n + 1)}>
            Increment
          </button>
          <button
            type="button"
            onClick={() => {
              theme.remove()
              count.remove()
            }}
          >
            Reset
          </button>
        </div>
      </div>
      <p class="example-muted">
        Backed by <code>localStorage</code> — reload the page and your choices
        persist; open a second tab and they sync live.
      </p>
    </div>
  )
}
