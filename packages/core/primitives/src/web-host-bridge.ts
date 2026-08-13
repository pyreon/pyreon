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
}

type HostWindow = Window & {
  __pyreonData?: unknown
  pyreonPostMessage?: (message: string) => void
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
    return { data: () => undefined, onData: () => () => {}, emit: () => {} }
  }
  const win = window as HostWindow
  return {
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
