// `@pyreon/charts/webview` — host `@pyreon/charts`-grade ECharts inside a
// native `<WebView>` (WKWebView on iOS, Android WebView) so the FULL charting
// engine works on every target from ONE `.tsx` source.
//
// WHY THIS EXISTS. `@pyreon/charts` is web-only by architecture — it wraps
// ECharts (a canvas/SVG engine PMTC can't compile to SwiftUI/Compose). The
// sanctioned multiplatform answer (docs/multiplatform.md) is the `<WebView>`
// primitive + its bidirectional data bridge. Before this module, an app had
// to HAND-WRITE the hosted HTML page + the bridge wiring per app (see the
// `native-analytics` demo's inline `CHART_HTML`). This makes it a first-class,
// reusable capability: `<ChartWebView option={…} onSelect={…} />` gives you
// real ECharts on web + iOS + Android, driven by signals.
//
// THE BRIDGE CONTRACT (identical on web/iOS/Android — the exact protocol the
// shipped `PyreonWebView` runtime hosts speak):
//   • FORWARD — the `option` you pass becomes `data={…}` on `<WebView>`. PMTC
//     JSON-encodes it and pushes it into the live page as `window.__pyreonData`
//     + a `pyreondata` event, WITHOUT reloading — the chart re-renders in place
//     (zoom/animation preserved). So `option` is the SAME ECharts option object
//     `<Chart options={…}>` takes — a data-driven option (no embedded
//     `formatter`/`renderItem` closures) is JSON-pure and crosses cleanly.
//   • REVERSE — a tap on a chart element calls `window.pyreonPostMessage(json)`
//     → your `onSelect(payload)` native/web closure, so hosted viz drives
//     native signals.
//
// SELF-CONTAINED / App-Store-safe: pass `echartsScript` (your bundled ECharts
// UMD source) so the page inlines it and needs no network — required for the
// native targets' local-asset policy. Omit it and the page loads ECharts from
// a CDN (`echartsSrc`), which is fine for web/dev but NOT offline or
// policy-safe on device.

import { h } from '@pyreon/core'
import type { VNode, VNodeChild } from '@pyreon/core'
import { WebView } from '@pyreon/primitives'

/** The subset of an ECharts click event this host serializes back through the
 *  reverse bridge (the full event carries DOM/engine refs that can't cross). */
export interface ChartSelectPayload {
  seriesName?: string
  seriesIndex?: number
  name?: string
  dataIndex?: number
  /** The clicked datum's value (number, array, or object — whatever the series holds). */
  value?: unknown
  /** `componentType` of the clicked element (e.g. `'series'`). */
  componentType?: string
}

/** A serializable command delivered to the hosted chart exactly once per id. */
export interface ChartHostCommand {
  /** Stable identity used to prevent re-running a command after option updates. */
  id: string | number
  /** Command name understood by the hosted chart engine. */
  type: string
  [key: string]: unknown
}

/** A JSON-safe event emitted by the hosted chart. */
export interface ChartHostEvent {
  name: string
  payload: Record<string, unknown>
}

type ChartHostAccessor<T> = T | (() => T)

export interface BuildChartHostHtmlOptions {
  /**
   * ECharts UMD/IIFE source, INLINED into the page — makes it fully
   * self-contained (offline, and satisfies the iOS/Android local-asset
   * policy). Read your bundled `echarts/dist/echarts.min.js` and pass it
   * here. Takes precedence over `echartsSrc`.
   */
  echartsScript?: string
  /**
   * URL to load ECharts from via `<script src>` when `echartsScript` is not
   * inlined. Dev/web convenience only — NOT offline and NOT native-policy
   * safe. Defaults to the pinned jsDelivr build.
   */
  echartsSrc?: string
  /**
   * ECharts theme name (must be registered in the inlined script) or omit for
   * the default. Passed straight to `echarts.init(el, theme)`.
   */
  theme?: string
  /** Renderer for `echarts.init` — `'canvas'` (default) or `'svg'`. */
  renderer?: 'canvas' | 'svg'
  /**
   * Background color for the page body (behind a transparent chart). Defaults
   * to `transparent` so the native/web container's background shows through.
   */
  background?: string
  /** Additional chart event names to forward through the reverse bridge. */
  forwardEvents?: readonly string[]
}

const DEFAULT_ECHARTS_SRC = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'

// Escape a string for safe inclusion inside a `<script>` block — only `</` needs
// breaking so a `</script>` inside data/theme can't close the tag early.
/**
 * Neutralise the two token sequences that can end an inline `<script>` early.
 *
 * `</` → `<\/` keeps the element from being CLOSED. That alone was the whole
 * escape, and it is not enough: the HTML tokenizer also enters the
 * script-data-DOUBLE-escaped state on `<!--` followed by `<script`, and in that
 * state the page's own literal `</script>` no longer ends the element — it
 * hands the rest of the document to the script. So `<!--` is broken too.
 *
 * Both are IDENTITY escapes in the contexts a bundle actually contains these
 * bytes — `\/` in a string or regex is `/`, `\-` is `-` — so the JS is
 * unchanged. The one shape this alters is an Annex-B `<!--` HTML-like comment
 * in code position, which no bundler emits and which is deprecated.
 *
 * Honest limit: this is defence-in-depth for a DEVELOPER-supplied bundle, not a
 * sanitiser. Never inline a script you do not trust — no escape makes that safe.
 */
const scriptSafe = (s: string): string =>
  s.replace(/<\//g, '<\\/').replace(/<!--/g, '<!\\--')

/**
 * A CSS value that cannot escape the `<style>` element it is written into.
 *
 * `<style>` is a RAW-TEXT element: character references are not decoded inside
 * it, so the `&quot;` escaping this used to do was inert, and `</style>` in the
 * value closed the element and put everything after it into the document. A
 * real CSS colour or gradient never contains `<`, so dropping that class is
 * lossless — and `"`/`'` go with it, since an unbalanced quote swallows the
 * rest of the sheet.
 */
const cssValueSafe = (s: string): string => s.replace(/[<>"']/g, '')

/** Escape a value written into a double-quoted HTML attribute. */
const attrSafe = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * Build the self-contained HTML page that hosts a real ECharts chart driven by
 * the `<WebView>` data bridge. The page:
 *  - `echarts.init`s a full-bleed container,
 *  - reads `window.__pyreonData` as the ECharts OPTION and `setOption(opt, true)`s
 *    it (full replace, so a signal-driven data swap renders cleanly),
 *  - re-applies on every `pyreondata` event (the forward bridge),
 *  - forwards `click` events as a JSON string via `window.pyreonPostMessage`
 *    (the reverse bridge),
 *  - `resize()`s on window resize.
 *
 * Pass this as `<WebView html={…}>` (or use `<ChartWebView>`, which does it for
 * you).
 */
export function buildChartHostHtml(options: BuildChartHostHtmlOptions = {}): string {
  const {
    echartsScript,
    echartsSrc = DEFAULT_ECHARTS_SRC,
    theme,
    renderer = 'canvas',
    background = 'transparent',
    forwardEvents = [],
  } = options

  const engineTag = echartsScript
    ? `<script>${scriptSafe(echartsScript)}</script>`
    : `<script src="${attrSafe(echartsSrc)}"></script>`

  // A theme is an ECharts theme NAME (a registered identifier); JSON.stringify
  // emits a properly-escaped JS string literal so a name containing a quote can't
  // break out of the `echarts.init(...)` call. `renderer` is a two-value enum —
  // validate rather than interpolate an arbitrary string into the object literal.
  const themeArg = theme ? JSON.stringify(theme) : 'null'
  const safeRenderer = renderer === 'svg' ? 'svg' : 'canvas'
  const forwardedEventNames = JSON.stringify(
    Array.from(new Set(forwardEvents.filter((name) => typeof name === 'string' && name.length > 0 && name !== 'click'))),
  )

  // The bridge script — kept dependency-free vanilla JS so it runs in the
  // hosted page with only ECharts present.
  const bridge = `
(function () {
  function pyreonReportHostError(msg) {
    /* Tell the HOST, not just this page. Setting a window flag and returning
       left every target showing a blank frame forever, with the diagnosis
       stranded inside the very frame nobody can read from. The reverse bridge
       is already here for ordinary events; a failure is the one message that
       most needs it.

       RETRIES, because the host installs pyreonPostMessage on load and this
       can run first: the page's own script executes at parse time. Reporting
       once and giving up put the message back where it started, nowhere. */
    var left = 120;
    (function attempt() {
      try {
        if (typeof window.pyreonPostMessage === 'function') {
          window.pyreonPostMessage(JSON.stringify({ error: msg }));
          return;
        }
      } catch (e) { return; }
      if (--left > 0) setTimeout(attempt, 16);
    })();
  }
  try {
  if (typeof echarts === 'undefined') { window.__pyreonChartError = 'echarts undefined'; pyreonReportHostError(window.__pyreonChartError); return; }
  var el = document.getElementById('pyreon-chart');
  var chart = echarts.init(el, ${themeArg}, { renderer: '${safeRenderer}' });

  var lastSig = null, rafId = 0, lastLoading = null, lastLoadingOptions = null;
  var completedCommands = Object.create(null), completedCommandKeys = [];
  function seriesSig(opt) {
    var s = opt.series;
    if (Object.prototype.toString.call(s) === '[object Array]') {
      var out = s.length + '|';
      for (var i = 0; i < s.length; i++) out += (s[i] && s[i].type) + ',';
      return out;
    }
    if (s && typeof s === 'object') return '1|' + s.type;
    return '0|';
  }
  function doApply() {
    rafId = 0;
    var input = window.__pyreonData;
    // The bridge may deliver the option as an already-parsed object (web:
    // contentWindow.__pyreonData = value) or, defensively, as a JSON string.
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { return; } }
    var isEnvelope = input && input.__pyreonChartHost === 1;
    var opt = isEnvelope ? input.option : input;
    if (!opt || typeof opt !== 'object') return;
    var sig = seriesSig(opt);
    // PERF: same series structure → MERGE (ECharts diffs + animates the data
    // change — far cheaper than a teardown+rebuild); structure CHANGED (series
    // added/removed/retyped) → full replace (notMerge) for correctness.
    chart.setOption(opt, sig !== lastSig);
    lastSig = sig;
    var commands = isEnvelope && Object.prototype.toString.call(input.commands) === '[object Array]' ? input.commands : [];
    for (var c = 0; c < commands.length; c++) {
      var command = commands[c];
      if (!command || (typeof command.id !== 'string' && typeof command.id !== 'number') || typeof command.type !== 'string') continue;
      var commandKey = typeof command.id + ':' + command.id;
      if (completedCommands[commandKey]) continue;
      try {
        chart.dispatchAction(command);
        completedCommands[commandKey] = true;
        completedCommandKeys.push(commandKey);
        if (completedCommandKeys.length > 1024) delete completedCommands[completedCommandKeys.shift()];
      } catch (e) { pyreonReportHostError(String(e && e.stack || e)); }
    }
    if (isEnvelope && input.loading) {
      var visible = input.loading.visible === true;
      var loadingOptions = input.loading.options && typeof input.loading.options === 'object' ? input.loading.options : {};
      var loadingOptionsSig = '';
      try { loadingOptionsSig = JSON.stringify(loadingOptions); } catch (e) {}
      if (visible !== lastLoading || (visible && loadingOptionsSig !== lastLoadingOptions)) {
        if (visible) chart.showLoading('default', loadingOptions);
        else chart.hideLoading();
        lastLoading = visible;
        lastLoadingOptions = loadingOptionsSig;
      }
    }
  }
  // PERF: coalesce a burst of pushes (a signal updating several times before a
  // frame) into ONE setOption per frame — aligns work to the display and never
  // renders a value the user won't see.
  function apply() {
    if (rafId) return;
    if (typeof requestAnimationFrame === 'function') rafId = requestAnimationFrame(doApply);
    else doApply();
  }

  chart.on('click', function (p) {
    if (typeof window.pyreonPostMessage !== 'function') return;
    // Serialize only the JSON-safe fields — the raw event carries engine refs.
    var payload = {
      seriesName: p && p.seriesName,
      seriesIndex: p && p.seriesIndex,
      name: p && p.name,
      dataIndex: p && p.dataIndex,
      value: p && p.value,
      componentType: p && p.componentType
    };
    try { window.pyreonPostMessage(JSON.stringify(payload)); } catch (e) {}
  });

  function eventPayload(p) {
    var payload = {};
    if (!p || typeof p !== 'object') return payload;
    for (var key in p) {
      if (!Object.prototype.hasOwnProperty.call(p, key) || key === 'event') continue;
      try { payload[key] = JSON.parse(JSON.stringify(p[key])); } catch (e) {}
    }
    return payload;
  }
  var forwardedEvents = ${forwardedEventNames};
  for (var eventIndex = 0; eventIndex < forwardedEvents.length; eventIndex++) {
    (function (eventName) {
      chart.on(eventName, function (p) {
        if (typeof window.pyreonPostMessage !== 'function') return;
        try { window.pyreonPostMessage(JSON.stringify({ __pyreonChartEvent: 1, name: eventName, payload: eventPayload(p) })); } catch (e) {}
      });
    })(forwardedEvents[eventIndex]);
  }

  window.addEventListener('pyreondata', apply);
  window.addEventListener('resize', function () { chart.resize(); });
  // Observe the container's OWN size — a native host (or an iframe) sizing the
  // page AFTER load doesn't fire a window 'resize' inside it, so without this
  // a chart inited at 0-size (common: the host lays out after the page boots)
  // would never render. Covers device rotation + layout changes too.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function () { chart.resize(); }).observe(el);
  }
  apply();
  } catch (e) { window.__pyreonChartError = String(e && e.stack || e); }
})();`

  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">' +
    '<style>html,body{margin:0;padding:0;height:100%;width:100%;background:' +
    cssValueSafe(background) +
    '}#pyreon-chart{height:100%;width:100%}</style></head>' +
    '<body><div id="pyreon-chart"></div>' +
    engineTag +
    '<script>' +
    scriptSafe(bridge) +
    '</script></body></html>'
  )
}

export interface ChartWebViewProps {
  /**
   * The ECharts option — the SAME object `<Chart options={…}>` takes. Pass a
   * signal accessor for reactivity; on change it's pushed into the hosted page
   * without reload. Use a data-driven option (avoid embedded
   * `formatter`/`renderItem` closures — they don't survive JSON encoding across
   * the native bridge).
   */
  option: unknown
  /** Tap-a-chart-element callback — receives the parsed {@link ChartSelectPayload}. */
  onSelect?: (payload: ChartSelectPayload) => void
  /** Serializable commands; each command runs once for its stable `id`. */
  commands?: ChartHostAccessor<readonly ChartHostCommand[]>
  /** Reactive visibility of the hosted loading overlay. */
  loading?: ChartHostAccessor<boolean>
  /** Serializable appearance options for the hosted loading overlay. */
  loadingOptions?: ChartHostAccessor<Record<string, unknown>>
  /** Receives events selected by {@link forwardEvents}. */
  onEvent?: (event: ChartHostEvent) => void
  /**
   * Provide your own host HTML (advanced). If omitted, one is built via
   * {@link buildChartHostHtml} from the `echarts*`/`theme`/`renderer` props.
   * Building it ONCE at module scope (a `const`) and passing it here is
   * recommended — PMTC const-ref resolution inlines it into the native
   * `PyreonWebView(html:)` call, and it avoids rebuilding the (large) string
   * per render.
   */
  html?: string
  /** Inlined ECharts UMD source (self-contained page) — see {@link BuildChartHostHtmlOptions}. */
  echartsScript?: string
  /** ECharts CDN URL when not inlining — see {@link BuildChartHostHtmlOptions}. */
  echartsSrc?: string
  /** ECharts theme name registered in the inlined script. */
  theme?: string
  /** `'canvas'` (default) or `'svg'`. */
  renderer?: 'canvas' | 'svg'
  /** Additional hosted event names to forward to {@link onEvent}. */
  forwardEvents?: readonly string[]
}

/**
 * `<ChartWebView option={…} onSelect={…} />` — a real ECharts chart hosted in a
 * native `<WebView>`, driven by the `option` signal. Compiles to a `WKWebView`
 * on iOS, an Android `WebView`, and an `<iframe srcdoc>` on web — same bridge
 * on every target. This is the multiplatform counterpart to `<Chart>`; put it
 * behind `<NativeIOS>`/`<NativeAndroid>` (with a `<Web>` branch rendering
 * `<Chart>` directly) or use it uniformly.
 *
 * @example
 * // Build the host once (const-ref inlines it into the native call):
 * const HOST = buildChartHostHtml({ echartsScript: BUNDLED_ECHARTS })
 * // …
 * <ChartWebView
 *   html={HOST}
 *   option={() => ({ xAxis: { data: labels() }, yAxis: {}, series: [{ type: 'bar', data: values() }] })}
 *   onSelect={(p) => selected.set(String(p.name))}
 * />
 */
export function ChartWebView(props: ChartWebViewProps): VNode {
  const built: BuildChartHostHtmlOptions = {}
  if (props.echartsScript !== undefined) built.echartsScript = props.echartsScript
  if (props.echartsSrc !== undefined) built.echartsSrc = props.echartsSrc
  if (props.theme !== undefined) built.theme = props.theme
  if (props.renderer !== undefined) built.renderer = props.renderer
  if (props.forwardEvents !== undefined) built.forwardEvents = props.forwardEvents
  const html = props.html ?? buildChartHostHtml(built)

  const webViewProps: Record<string, unknown> = { html }
  // Forward `option` to `<WebView data>` PRESERVING reactivity — a getter that
  // re-reads `props.option` on every access. Reading it eagerly (`data:
  // props.option`) would collapse a compiler-wrapped reactive prop to a static
  // value (the descriptor-copy rule). An explicit `() => option` accessor is
  // unwrapped; a plain option object passes through. `<WebView>`'s own
  // data-tracking effect reads this getter, so a signal change re-pushes.
  Object.defineProperty(webViewProps, 'data', {
    enumerable: true,
    configurable: true,
    get(): unknown {
      const o = props.option
      const option = typeof o === 'function' ? (o as () => unknown)() : o
      if (props.commands === undefined && props.loading === undefined) return option
      const commandSource = props.commands
      const commands = typeof commandSource === 'function' ? commandSource() : (commandSource ?? [])
      const loadingSource = props.loading
      const loading = typeof loadingSource === 'function' ? loadingSource() : (loadingSource ?? false)
      const loadingOptionsSource = props.loadingOptions
      const loadingOptions =
        typeof loadingOptionsSource === 'function' ? loadingOptionsSource() : (loadingOptionsSource ?? {})
      return { __pyreonChartHost: 1, option, commands, loading: { visible: loading, options: loadingOptions } }
    },
  })
  if (props.onSelect || props.onEvent) {
    const onSelect = props.onSelect
    const onEvent = props.onEvent
    webViewProps.onMessage = (message: string): void => {
      let payload: ChartSelectPayload | (ChartHostEvent & { __pyreonChartEvent: 1 })
      try {
        payload = JSON.parse(message) as ChartSelectPayload | (ChartHostEvent & { __pyreonChartEvent: 1 })
      } catch {
        // A non-JSON message — hand back the raw string as `name` so nothing
        // is silently dropped.
        payload = { name: message }
      }
      if (payload && typeof payload === 'object' && '__pyreonChartEvent' in payload)
        onEvent?.({ name: payload.name, payload: payload.payload })
      else onSelect?.(payload)
    }
  }
  return h(WebView as (p: unknown) => VNodeChild, webViewProps) as VNode
}
