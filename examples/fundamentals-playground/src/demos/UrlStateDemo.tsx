import { useUrlState } from '@pyreon/url-state'

export function UrlStateDemo() {
  // Schema mode — multiple URL params from a single call. Returns
  // `{ [K]: UrlStateSignal<T[K]> }` — each field is its OWN reactive
  // signal. Numbers/booleans/arrays auto-coerced via inferred serializers,
  // uses `replaceState` (no history spam), SSR-safe.
  const state = useUrlState({
    page: 1,
    q: '',
    showCompleted: false,
    tags: [] as string[],
  })

  return (
    <div>
      <h2>URL State</h2>
      <p class="desc">
        URL-synced state — multiple params from a single call, auto type coercion (numbers,
        booleans, arrays), <code>replaceState</code> (no history spam), SSR-safe. Edit the controls
        below and watch the URL bar update.
      </p>

      <div class="section">
        <h3>Live URL params</h3>
        <p style="margin-bottom: 12px; font-size: 13px; color: #666">
          Open DevTools → URL bar to see the params update in real time.
        </p>
        <pre style="font-size: 13px" data-testid="url-state-snapshot">
          {() =>
            JSON.stringify(
              {
                page: state.page(),
                q: state.q(),
                showCompleted: state.showCompleted(),
                tags: state.tags(),
              },
              null,
              2,
            )
          }
        </pre>
      </div>

      <div class="section">
        <h3>Controls</h3>

        <div class="field">
          <label>Page (number)</label>
          <div class="row">
            <button
              data-testid="url-state-prev"
              onClick={() => state.page.set(Math.max(1, state.page() - 1))}
            >
              ← prev
            </button>
            <span data-testid="url-state-page">page {() => state.page()}</span>
            <button data-testid="url-state-next" onClick={() => state.page.set(state.page() + 1)}>
              next →
            </button>
          </div>
        </div>

        <div class="field">
          <label>Search query (string)</label>
          <input
            type="text"
            data-testid="url-state-q"
            placeholder="Type to update ?q=…"
            value={() => state.q()}
            onInput={(e) => state.q.set(e.currentTarget.value)}
          />
        </div>

        <div class="field">
          <label>
            <input
              type="checkbox"
              data-testid="url-state-completed"
              checked={() => state.showCompleted()}
              onChange={(e) => state.showCompleted.set(e.currentTarget.checked)}
              style="width: auto; margin-right: 6px"
            />
            Show completed (boolean)
          </label>
        </div>

        <div class="field">
          <label>Tags (array — comma-separated)</label>
          <input
            type="text"
            data-testid="url-state-tags"
            placeholder="urgent, work, home"
            value={() => state.tags().join(', ')}
            onInput={(e) =>
              state.tags.set(
                e.currentTarget.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        </div>
      </div>

      <div class="section">
        <h3>Reset</h3>
        <button
          data-testid="url-state-reset"
          onClick={() => {
            state.page.set(1)
            state.q.set('')
            state.showCompleted.set(false)
            state.tags.set([])
          }}
        >
          Clear all params
        </button>
      </div>
    </div>
  )
}
