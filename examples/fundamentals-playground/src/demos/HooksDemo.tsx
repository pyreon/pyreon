import { signal } from '@pyreon/reactivity'
import {
  useClipboard,
  useDebouncedValue,
  useOnline,
  useTimeAgo,
  useToggle,
  useWindowResize,
} from '@pyreon/hooks'

const mountedAt = new Date()

export function HooksDemo() {
  // useToggle — boolean signal + .toggle()
  const open = useToggle(false)

  // useDebouncedValue — debounce a signal by ms
  const query = signal('')
  const debouncedQuery = useDebouncedValue(query, 300)

  // useClipboard — write to clipboard, auto-resets `copied` after 2s
  const clipboard = useClipboard()

  // useTimeAgo — reactive "5s ago" / "1 min ago" string
  const ago = useTimeAgo(mountedAt)

  // useOnline — navigator.onLine signal, listens to online/offline events
  const online = useOnline()

  // useWindowResize — window dimensions signal
  const win = useWindowResize()

  return (
    <div>
      <h2>Hooks</h2>
      <p class="desc">
        34 signal-based hooks across state / DOM / responsive / timing / interaction categories. All
        SSR-safe + self-cleaning + signal-native (return Signal&lt;T&gt; / accessor objects, never
        plain values).
      </p>

      <div class="section">
        <h3>useToggle — boolean accessor + toggle/setTrue/setFalse</h3>
        <div class="row">
          <button
            data-testid="hooks-toggle-btn"
            class={() => (open.value() ? 'primary' : '')}
            onClick={() => open.toggle()}
          >
            {() => (open.value() ? 'Close' : 'Open')}
          </button>
          <span
            class={() => (open.value() ? 'badge green' : 'badge gray')}
            data-testid="hooks-toggle-state"
          >
            {() => (open.value() ? 'OPEN' : 'closed')}
          </span>
        </div>
      </div>

      <div class="section">
        <h3>useDebouncedValue — 300ms</h3>
        <p style="margin-bottom: 8px; font-size: 13px; color: #666">
          Live value updates as you type; debounced value lags 300ms behind.
        </p>
        <input
          type="text"
          data-testid="hooks-debounce-input"
          placeholder="Type something…"
          value={() => query()}
          onInput={(e) => query.set(e.currentTarget.value)}
        />
        <p style="margin-top: 8px; font-size: 13px">
          Live: <strong data-testid="hooks-live">{() => query() || '(empty)'}</strong>
          {' · '}
          Debounced:{' '}
          <strong data-testid="hooks-debounced">{() => debouncedQuery() || '(empty)'}</strong>
        </p>
      </div>

      <div class="section">
        <h3>useClipboard</h3>
        <div class="row">
          <button data-testid="hooks-copy" onClick={() => clipboard.copy('Pyreon ❤')}>
            Copy "Pyreon ❤"
          </button>
          <span
            class={() => (clipboard.copied() ? 'badge green' : 'badge gray')}
            data-testid="hooks-copied-state"
          >
            {() => (clipboard.copied() ? 'COPIED' : 'idle')}
          </span>
        </div>
      </div>

      <div class="section">
        <h3>useTimeAgo</h3>
        <p data-testid="hooks-ago">
          This demo mounted: <strong>{() => ago()}</strong>
        </p>
      </div>

      <div class="section">
        <h3>useOnline</h3>
        <p>
          Network:{' '}
          <span class={() => (online() ? 'badge green' : 'badge red')} data-testid="hooks-online">
            {() => (online() ? 'ONLINE' : 'OFFLINE')}
          </span>
        </p>
        <p style="font-size: 13px; color: #666; margin-top: 6px">
          Toggle your network in DevTools → Network tab to see this flip.
        </p>
      </div>

      <div class="section">
        <h3>useWindowResize</h3>
        <p data-testid="hooks-window">
          Window: {() => win().width}×{() => win().height}
        </p>
      </div>
    </div>
  )
}
