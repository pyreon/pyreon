// `@pyreon/code/webview` — host a real CodeMirror editor inside a native
// `<WebView>` (WKWebView on iOS, Android WebView) so the full editor works on
// every target from one source, driven by the same value/language/readOnly
// signals as `createEditor`.
//
// WHY THIS EXISTS. `@pyreon/code` wraps CodeMirror 6 — web-only (PMTC can't
// compile it to SwiftUI/Compose). The sanctioned multiplatform answer is the
// `<WebView>` bridge. CodeMirror is modular ESM (not a single UMD like ECharts),
// so — exactly like `buildChartHostHtml({ echartsScript })` — the APP bundles
// CodeMirror and exposes it as a `window.CM` namespace; this host owns the
// generic bridge that drives it.
//
// THE `window.CM` CONTRACT (the app's bundled script assigns it):
//   window.CM = {
//     EditorView, EditorState, Compartment,   // @codemirror/{view,state}
//     basicSetup,                             // `codemirror` (or a minimal set)
//     languageFor?(name): Extension           // optional: name -> a language ext
//   }
// A ~15-line entry the app bundles with its own @codemirror/* + lang packages.
//
// BRIDGE CONTRACT (identical to the native PyreonWebView runtime hosts):
//   • FORWARD — `data={{ value, language?, readOnly? }}` → window.__pyreonData
//     (+ pyreondata event) → the editor's doc/language/read-only update IN
//     PLACE (cursor + scroll preserved; no reload). `value` is the editor text.
//   • REVERSE — a user edit → window.pyreonPostMessage(JSON {value}) →
//     `onChange(value)`, so the hosted editor drives native signals. A loop
//     guard suppresses the echo of a value WE pushed.

import { h } from '@pyreon/core'
import type { VNode, VNodeChild } from '@pyreon/core'
import { WebView } from '@pyreon/primitives'

/** The value pushed across the forward bridge. */
export interface CodeWebViewData {
  value: string
  /** Language name resolved by the app's `window.CM.languageFor`. */
  language?: string
  readOnly?: boolean
}

export interface BuildCodeHostHtmlOptions {
  /**
   * A bundled IIFE that assigns `window.CM` (see the contract above) — the
   * app's CodeMirror, bundled. INLINED into the page (self-contained /
   * App-Store-safe). Omit `codemirrorScript` + set `codemirrorSrc` to load it
   * from a bundled asset instead.
   */
  codemirrorScript?: string
  /** A `<script src>` URL/asset for the `window.CM` bundle when not inlined. */
  codemirrorSrc?: string
  /** Page background (behind the editor). Default `transparent`. */
  background?: string
}

/**
 * Neutralise the two token sequences that can end an inline `<script>` early.
 *
 * `</` → `<\/` keeps the element from being CLOSED. That alone was the whole
 * escape, and it is not enough: the HTML tokenizer also enters the
 * script-data-DOUBLE-escaped state on `<!--` followed by `<script`, and in that
 * state our own literal `</script>` no longer ends the element — it hands the
 * rest of the document to the script. So `<!--` is broken too.
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
 * Build the self-contained HTML page hosting a CodeMirror editor driven by the
 * `<WebView>` bridge. Reads `window.__pyreonData` as `{ value, language?,
 * readOnly? }`, applies it via CM transactions (cursor-preserving for value,
 * Compartment reconfigure for language/read-only), re-applies on `pyreondata`,
 * and posts the new text via `window.pyreonPostMessage` on user edits.
 */
export function buildCodeHostHtml(options: BuildCodeHostHtmlOptions = {}): string {
  const { codemirrorScript, codemirrorSrc, background = 'transparent' } = options

  const engineTag = codemirrorScript
    ? `<script>${scriptSafe(codemirrorScript)}</script>`
    : codemirrorSrc
      ? `<script src="${attrSafe(codemirrorSrc)}"></script>`
      : ''

  const bridge = `
(function () {
  // Wait for window.CM — the app's bundled CodeMirror may load async (an
  // external <script src>, or injected by the native host after page load).
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
  var tries = 0;
  function waitCM() {
    if (window.CM) { boot(); return; }
    if (++tries > 800) { window.__pyreonCodeError = 'window.CM not provided (timed out)'; pyreonReportHostError(window.__pyreonCodeError); return; }
    setTimeout(waitCM, 10);
  }
  function boot() {
  try {
  var CM = window.CM;
  var el = document.getElementById('pyreon-code');
  var cur = { value: '', language: '', readOnly: false };
  var langComp = new CM.Compartment();
  var roComp = new CM.Compartment();
  var view = new CM.EditorView({
    parent: el,
    state: CM.EditorState.create({
      doc: '',
      extensions: [
        CM.basicSetup,
        langComp.of([]),
        roComp.of(CM.EditorState.readOnly.of(false)),
        CM.EditorView.updateListener.of(function (u) {
          if (!u.docChanged) return;
          var v = u.state.doc.toString();
          // Loop guard: skip the echo of a value WE pushed (cur.value set
          // BEFORE dispatch below).
          if (v === cur.value) return;
          cur.value = v;
          if (typeof window.pyreonPostMessage === 'function') {
            try { window.pyreonPostMessage(JSON.stringify({ value: v })); } catch (e) {}
          }
        }),
      ],
    }),
  });
  function apply() {
    var d = window.__pyreonData;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
    if (!d || typeof d !== 'object') return;
    if (typeof d.value === 'string' && d.value !== cur.value) {
      cur.value = d.value;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: d.value } });
    }
    if (d.readOnly !== undefined && !!d.readOnly !== cur.readOnly) {
      cur.readOnly = !!d.readOnly;
      view.dispatch({ effects: roComp.reconfigure(CM.EditorState.readOnly.of(cur.readOnly)) });
    }
    if (d.language !== undefined && d.language !== cur.language && typeof CM.languageFor === 'function') {
      cur.language = d.language;
      view.dispatch({ effects: langComp.reconfigure(CM.languageFor(d.language) || []) });
    }
  }
  window.addEventListener('pyreondata', apply);
  apply();
  } catch (e) { window.__pyreonCodeError = String(e && e.stack || e); }
  }
  waitCM();
})();`

  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">' +
    '<style>html,body{margin:0;padding:0;height:100%;width:100%;background:' +
    cssValueSafe(background) +
    '}#pyreon-code,.cm-editor{height:100%;width:100%}</style></head>' +
    '<body><div id="pyreon-code"></div>' +
    engineTag +
    '<script>' +
    scriptSafe(bridge) +
    '</script></body></html>'
  )
}

export interface CodeWebViewProps {
  /** The editor value/language/read-only — pass a signal accessor for reactivity. */
  state: CodeWebViewData | (() => CodeWebViewData)
  /** User-edit callback — receives the new editor text. */
  onChange?: (value: string) => void
  /** Provide your own host HTML (advanced). Omit to build from the `codemirror*` opts. */
  html?: string
  /** Bundled `window.CM` IIFE — see {@link BuildCodeHostHtmlOptions}. */
  codemirrorScript?: string
  /** `<script src>` for the `window.CM` bundle when not inlined. */
  codemirrorSrc?: string
}

/**
 * `<CodeWebView state={…} onChange={…} />` — a real CodeMirror editor hosted in
 * a native `<WebView>`. Compiles to WKWebView / Android WebView / an `<iframe
 * srcdoc>` on web — same bridge everywhere. The multiplatform counterpart to
 * `<CodeEditor>`.
 *
 * @example
 * const HOST = buildCodeHostHtml({ codemirrorScript: BUNDLED_CM })
 * <CodeWebView
 *   html={HOST}
 *   state={() => ({ value: source(), language: 'javascript', readOnly: locked() })}
 *   onChange={(v) => source.set(v)}
 * />
 */
export function CodeWebView(props: CodeWebViewProps): VNode {
  const built: BuildCodeHostHtmlOptions = {}
  if (props.codemirrorScript !== undefined) built.codemirrorScript = props.codemirrorScript
  if (props.codemirrorSrc !== undefined) built.codemirrorSrc = props.codemirrorSrc
  const html = props.html ?? buildCodeHostHtml(built)

  const webViewProps: Record<string, unknown> = { html }
  Object.defineProperty(webViewProps, 'data', {
    enumerable: true,
    configurable: true,
    get(): unknown {
      const s = props.state
      return typeof s === 'function' ? (s as () => unknown)() : s
    },
  })
  if (props.onChange) {
    const onChange = props.onChange
    webViewProps.onMessage = (message: string): void => {
      try {
        const p = JSON.parse(message) as { value?: string }
        if (typeof p.value === 'string') onChange(p.value)
      } catch {
        onChange(message)
      }
    }
  }
  return h(WebView as (p: unknown) => VNodeChild, webViewProps) as VNode
}
