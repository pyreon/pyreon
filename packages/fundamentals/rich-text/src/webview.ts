// `@pyreon/rich-text/webview` — host a real TipTap WYSIWYG editor inside a
// native `<WebView>` (WKWebView on iOS, Android WebView) so the full editor
// works on every target from one source, driven by the same content/editable
// signals as `createRichTextEditor`.
//
// WHY THIS EXISTS. `@pyreon/rich-text` wraps TipTap/ProseMirror — web-only
// (PMTC can't compile it to SwiftUI/Compose). The sanctioned multiplatform
// answer is the `<WebView>` bridge. TipTap is modular ESM with app-chosen
// extensions, so — like `buildChartHostHtml({ echartsScript })` / the code
// host — the APP provides its bundled editor as a `window.TT` FACTORY and this
// host owns the generic bridge that drives it.
//
// THE `window.TT` CONTRACT (the app's bundled script assigns it):
//   window.TT = {
//     createEditor(el, opts): {
//       setContent(content): void   // replace the document (JSON or HTML)
//       setEditable(on): void       // toggle read-only
//       destroy(): void
//     }
//   }
//   // opts = { content, editable, onUpdate(json) } — the app wires TipTap's
//   // `new Editor({ element: el, extensions, content, editable,
//   //   onUpdate: ({ editor }) => onUpdate(editor.getJSON()) })`.
// A ~10-line factory the app bundles with its @tiptap/* + chosen extensions.
//
// BRIDGE CONTRACT (identical to the native PyreonWebView runtime hosts):
//   • FORWARD — `data={{ content, editable? }}` → window.__pyreonData (+
//     pyreondata) → the editor's document/editability update IN PLACE (no
//     reload). `content` is TipTap JSON (`{ type:'doc', content:[…] }`) or HTML.
//   • REVERSE — a user edit → window.pyreonPostMessage(JSON {content}) →
//     `onChange(content)`, so the hosted editor drives native signals. A loop
//     guard suppresses the echo of content WE pushed.

import { h } from '@pyreon/core'
import type { VNode, VNodeChild } from '@pyreon/core'
import { WebView } from '@pyreon/primitives'

/** The value pushed across the forward bridge. `content` is TipTap JSON or HTML. */
export interface RichTextWebViewData {
  content: unknown
  editable?: boolean
}

export interface BuildRichTextHostHtmlOptions {
  /**
   * A bundled IIFE that assigns `window.TT` (see the contract above) — the
   * app's TipTap, bundled. INLINED (self-contained / App-Store-safe). Omit and
   * set `tiptapSrc` to load a bundled asset instead.
   */
  tiptapScript?: string
  /** A `<script src>` URL/asset for the `window.TT` bundle when not inlined. */
  tiptapSrc?: string
  /** Page background. Default `transparent`. */
  background?: string
}

const scriptSafe = (s: string): string => s.replace(/<\//g, '<\\/')

/**
 * Build the self-contained HTML page hosting a TipTap editor driven by the
 * `<WebView>` bridge. Waits for `window.TT`, creates the editor, applies
 * `{ content, editable? }` from `window.__pyreonData` (replacing the document
 * only when it changed — loop-guarded), re-applies on `pyreondata`, and posts
 * the JSON via `window.pyreonPostMessage` on user edits.
 */
export function buildRichTextHostHtml(options: BuildRichTextHostHtmlOptions = {}): string {
  const { tiptapScript, tiptapSrc, background = 'transparent' } = options

  const engineTag = tiptapScript
    ? `<script>${scriptSafe(tiptapScript)}</script>`
    : tiptapSrc
      ? `<script src="${tiptapSrc.replace(/"/g, '&quot;')}"></script>`
      : ''

  const bridge = `
(function () {
  var tries = 0;
  function waitTT() {
    if (window.TT && typeof window.TT.createEditor === 'function') { boot(); return; }
    if (++tries > 800) { window.__pyreonRichTextError = 'window.TT not provided (timed out)'; return; }
    setTimeout(waitTT, 10);
  }
  function boot() {
  try {
  var el = document.getElementById('pyreon-richtext');
  var cur = { content: null, editable: true };
  var lastPushed = null; // JSON string of content WE last pushed (loop guard)
  var editor = window.TT.createEditor(el, {
    content: null,
    editable: true,
    onUpdate: function (json) {
      var s;
      try { s = JSON.stringify(json); } catch (e) { return; }
      // Loop guard: skip the echo of content WE pushed.
      if (s === lastPushed) return;
      cur.content = json;
      if (typeof window.pyreonPostMessage === 'function') {
        try { window.pyreonPostMessage(JSON.stringify({ content: json })); } catch (e) {}
      }
    }
  });
  function apply() {
    var d = window.__pyreonData;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
    if (!d || typeof d !== 'object') return;
    if (d.content !== undefined) {
      var s;
      try { s = JSON.stringify(d.content); } catch (e) { s = null; }
      if (s !== null && s !== JSON.stringify(cur.content)) {
        cur.content = d.content;
        lastPushed = s;
        editor.setContent(d.content);
      }
    }
    if (d.editable !== undefined && !!d.editable !== cur.editable) {
      cur.editable = !!d.editable;
      editor.setEditable(cur.editable);
    }
  }
  window.addEventListener('pyreondata', apply);
  apply();
  } catch (e) { window.__pyreonRichTextError = String(e && e.stack || e); }
  }
  waitTT();
})();`

  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">' +
    '<style>html,body{margin:0;padding:0;height:100%;width:100%;background:' +
    background.replace(/"/g, '&quot;') +
    '}#pyreon-richtext,.ProseMirror{height:100%;width:100%;outline:none;box-sizing:border-box;padding:8px}</style></head>' +
    '<body><div id="pyreon-richtext"></div>' +
    engineTag +
    '<script>' +
    scriptSafe(bridge) +
    '</script></body></html>'
  )
}

export interface RichTextWebViewProps {
  /** Editor content (TipTap JSON or HTML) + editability — pass a signal accessor for reactivity. */
  state: RichTextWebViewData | (() => RichTextWebViewData)
  /** User-edit callback — receives the new TipTap JSON. */
  onChange?: (content: unknown) => void
  /** Provide your own host HTML (advanced). Omit to build from the `tiptap*` opts. */
  html?: string
  /** Bundled `window.TT` IIFE — see {@link BuildRichTextHostHtmlOptions}. */
  tiptapScript?: string
  /** `<script src>` for the `window.TT` bundle when not inlined. */
  tiptapSrc?: string
}

/**
 * `<RichTextWebView state={…} onChange={…} />` — a real TipTap WYSIWYG editor
 * hosted in a native `<WebView>`. Compiles to WKWebView / Android WebView / an
 * `<iframe srcdoc>` on web — same bridge everywhere. The multiplatform
 * counterpart to `<RichText>`.
 *
 * @example
 * const HOST = buildRichTextHostHtml({ tiptapScript: BUNDLED_TT })
 * <RichTextWebView
 *   html={HOST}
 *   state={() => ({ content: doc(), editable: !locked() })}
 *   onChange={(json) => doc.set(json)}
 * />
 */
export function RichTextWebView(props: RichTextWebViewProps): VNode {
  const built: BuildRichTextHostHtmlOptions = {}
  if (props.tiptapScript !== undefined) built.tiptapScript = props.tiptapScript
  if (props.tiptapSrc !== undefined) built.tiptapSrc = props.tiptapSrc
  const html = props.html ?? buildRichTextHostHtml(built)

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
        const p = JSON.parse(message) as { content?: unknown }
        if (p.content !== undefined) onChange(p.content)
      } catch {
        onChange(message)
      }
    }
  }
  return h(WebView as (p: unknown) => VNodeChild, webViewProps) as VNode
}
