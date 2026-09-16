// Guest-side glue for the `<WebView>` bridge — the reusable other half of
// the WebView-host pattern.
//
// A web-only-rich component (a `@pyreon/charts` chart, a `@pyreon/flow`
// diagram, a `@pyreon/rich-text` editor) that cannot be reimplemented as a
// native view still runs 1:1 on iOS/Android by being built as a
// self-contained bundle and HOSTED in a `<WebView>` — an `<iframe srcdoc>`
// on web, a `WKWebView` on iOS, an Android `WebView`. This helper is what
// that bundle runs INSIDE the hosted page to talk to its host, so the same
// code drives the chart/editor on every platform:
//
//   - the host PUSHES props via `window.__pyreonData` + a `pyreondata`
//     event (see `WebViewProps.data`) — `data()` reads the current value,
//     `onData(cb)` subscribes to every push;
//   - the guest SENDS events back via the unified `window.pyreonPostMessage`
//     API (see `WebViewProps.onMessage`) — `emit(msg)` calls it.
//
// It is the SINGLE tested implementation of that contract, so each
// package's bundle entry is thin and identical across platforms instead of
// hand-rolling the `window.__pyreonData` / `pyreonPostMessage` wiring (as
// `examples/native-analytics` does inline). See `WebView` + `WebViewProps`.

import { isServer } from '@pyreon/reactivity'

/** The guest end of the `<WebView>` bridge — read host data, send messages. */
export interface WebHostConnection<T> {
  /** The data the host most recently pushed (the component's props). `undefined` before the first push. */
  data(): T | undefined
  /**
   * Subscribe to host data pushes — the callback fires on every `pyreondata`
   * event with the fresh `window.__pyreonData`. Returns an unsubscribe.
   */
  onData(callback: (data: T | undefined) => void): () => void
  /** Send a string message back to the host's `onMessage` handler (JSON-stringify structured payloads). */
  emit(message: string): void
  /**
   * Join a host group. Every hosted page is its own realm, so two guests can
   * never reach each other directly; the HOST fans {@link WebHostConnection.relay}
   * messages into every other guest of the same group (an `<iframe>` sibling on
   * web, another `WKWebView` / Android `WebView` natively). A page is in at
   * most one group — joining another leaves the first.
   */
  joinGroup(group: string): void
  /** Leave the current host group (a no-op when not in one). */
  leaveGroup(): void
  /** Send a string to every OTHER guest in the current group (never echoed back). */
  relay(message: string): void
  /** Subscribe to strings relayed by sibling guests of the same group. Returns an unsubscribe. */
  onRelay(callback: (message: string) => void): () => void
}

/**
 * The host-group protocol the `<WebView>` hosts speak on every target. A
 * guest posts these through the SAME `window.pyreonPostMessage` channel as
 * its ordinary messages; the host consumes them and never forwards them to
 * `onMessage`. Inbound relays arrive through `window.__pyreonWebViewGroupMessage`.
 */
export const WEB_HOST_GROUP_MARKER = '__pyreonWebViewGroup'
export const WEB_HOST_GROUP_RELAY_FN = '__pyreonWebViewGroupMessage'

export type WebHostGroupMessage =
  | { [WEB_HOST_GROUP_MARKER]: 1; join: string }
  | { [WEB_HOST_GROUP_MARKER]: 1; leave: true }
  | { [WEB_HOST_GROUP_MARKER]: 1; group: string; message: string }

/**
 * Parse a guest message as a host-group message. Returns `null` for anything
 * else — a host tests this FIRST and hands every other string to `onMessage`.
 * The prefix check keeps ordinary messages off the JSON parser.
 */
export function parseWebHostGroupMessage(message: string): WebHostGroupMessage | null {
  if (!message.startsWith(`{"${WEB_HOST_GROUP_MARKER}"`)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(message)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || (parsed as Record<string, unknown>)[WEB_HOST_GROUP_MARKER] !== 1) return null
  const value = parsed as Record<string, unknown>
  if (typeof value.join === 'string' && value.join !== '') return { [WEB_HOST_GROUP_MARKER]: 1, join: value.join }
  if (value.leave === true) return { [WEB_HOST_GROUP_MARKER]: 1, leave: true }
  if (typeof value.group === 'string' && value.group !== '' && typeof value.message === 'string') {
    return { [WEB_HOST_GROUP_MARKER]: 1, group: value.group, message: value.message }
  }
  return null
}

type HostWindow = Window & {
  __pyreonData?: unknown
  pyreonPostMessage?: (message: string) => void
  [WEB_HOST_GROUP_RELAY_FN]?: (message: string) => void
}

/**
 * Connect to the WebView host from inside the hosted page. Guest-only: in a
 * non-browser context (an accidental SSR of the bundle entry) every method
 * is an inert no-op, so importing it can never crash a build.
 *
 * @example
 * ```ts
 * // bundle entry, built to a self-contained HTML page hosted in <WebView>
 * import { connectWebHost } from '@pyreon/primitives'
 * const host = connectWebHost<{ rows: number[] }>()
 * const draw = (d?: { rows: number[] }) => renderChart(root, d?.rows ?? [])
 * draw(host.data())                  // initial props
 * host.onData(draw)                  // reactive updates from the host's signals
 * bar.onclick = () => host.emit(String(bar.dataset.id))  // event → host onMessage
 * ```
 */
export function connectWebHost<T = unknown>(): WebHostConnection<T> {
  if (isServer) {
    return {
      data: () => undefined,
      onData: () => () => {},
      emit: () => {},
      joinGroup: () => {},
      leaveGroup: () => {},
      relay: () => {},
      onRelay: () => () => {},
    }
  }
  const win = window as HostWindow
  let group: string | null = null
  const post = (message: WebHostGroupMessage): void => {
    win.pyreonPostMessage?.(JSON.stringify(message))
  }
  return {
    joinGroup: (name) => {
      if (name === '' || name === group) return
      group = name
      post({ [WEB_HOST_GROUP_MARKER]: 1, join: name })
    },
    leaveGroup: () => {
      if (group === null) return
      group = null
      post({ [WEB_HOST_GROUP_MARKER]: 1, leave: true })
    },
    relay: (message) => {
      if (group === null) return
      post({ [WEB_HOST_GROUP_MARKER]: 1, group, message })
    },
    onRelay: (callback) => {
      // The host calls ONE page-level function; fan it out to every subscriber
      // so several guest modules can listen without clobbering each other.
      const listeners = relayListeners(win)
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },
    data: () => win.__pyreonData as T | undefined,
    onData: (callback) => {
      const handler = (): void => callback(win.__pyreonData as T | undefined)
      // Raw `addEventListener` is intentional and correct here: this helper IS
      // the wrapper layer (like `@pyreon/hooks`' `useEventListener`) that owns
      // the raw listener so bundle authors don't. It runs in a GUEST bundle
      // inside the WebView — a plain page with no Pyreon lifecycle to hang a
      // hook off — and hands back the explicit unsubscribe below.
      // pyreon-lint-ignore pyreon/no-raw-addeventlistener
      win.addEventListener('pyreondata', handler)
      // pyreon-lint-ignore pyreon/no-raw-addeventlistener
      return () => win.removeEventListener('pyreondata', handler)
    },
    emit: (message) => {
      win.pyreonPostMessage?.(message)
    },
  }
}

const RELAY_LISTENERS = new WeakMap<Window, Set<(message: string) => void>>()

/** The page's relay subscribers, installing the host-facing entry point on first use. */
function relayListeners(win: HostWindow): Set<(message: string) => void> {
  let listeners = RELAY_LISTENERS.get(win)
  if (listeners === undefined) {
    listeners = new Set()
    RELAY_LISTENERS.set(win, listeners)
    const set = listeners
    win[WEB_HOST_GROUP_RELAY_FN] = (message: string): void => {
      for (const listener of set) listener(message)
    }
  }
  return listeners
}

/** Options for {@link webHostDocument}. */
export interface WebHostDocumentOptions {
  /**
   * The bundled guest script — an IIFE that calls `connectWebHost()` and
   * renders the web-only component into the mount root. Build your component
   * (with esbuild/Vite) to a self-contained IIFE and pass it here.
   */
  script: string
  /** Inline CSS for the hosted page (also inline any engine styles here). */
  css?: string
  /** The mount root element id the script renders into. Default `'root'`. */
  rootId?: string
  /** Optional page `<title>`. */
  title?: string
}

/**
 * Build the self-contained HTML page that a `<WebView html={…}>` hosts — the
 * document shell for the guest side of the WebView-host pattern. Pairs with
 * {@link connectWebHost}: bundle a web-only component to an IIFE that calls
 * `connectWebHost()`, wrap it with `webHostDocument({ script })`, and pass the
 * result as `<WebView html={…}>`. The SAME page runs in an `<iframe srcdoc>` on
 * web and a WKWebView / Android WebView on native, so the panel is 1:1.
 *
 * Everything is inlined (no external `<script>`/`<link>`) so it works as
 * `srcdoc` / `loadHTMLString` with no network and no CSP surprises.
 *
 * @example
 * ```ts
 * const html = webHostDocument({ script: BUNDLED_CHART_IIFE, css: chartCss })
 * // <WebView html={html} data={metrics()} onMessage={(m) => selected.set(m)} />
 * ```
 */
export function webHostDocument(options: WebHostDocumentOptions): string {
  const root = options.rootId ?? 'root'
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    (options.title === undefined ? '' : `<title>${options.title}</title>`) +
    (options.css === undefined ? '' : `<style>${options.css}</style>`) +
    `</head><body style="margin:0">` +
    `<div id="${root}"></div>` +
    `<script>${options.script}</script>` +
    '</body></html>'
  )
}
