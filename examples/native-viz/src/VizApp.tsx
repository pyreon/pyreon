// @ts-nocheck — PMTC handles typing; multi-child JSX + the generated host
// literals are noisy under plain tsc (same rationale as native-analytics).
//
// EXHAUSTIVE MULTIPLATFORM VIZ — ONE `.tsx` -> web + iOS + Android.
//
// The proof that `@pyreon/flow` + `@pyreon/code` + `@pyreon/rich-text` —
// web-only-rich UI that CANNOT compile to SwiftUI/Compose — nonetheless work on every target via the `<WebView>` bridge
// and the reusable HOSTS from each package's `/webview` subpath. `<WebView>`
// compiles to a WKWebView (iOS), an Android WebView, and an `<iframe srcdoc>`
// (web) — SAME bridge everywhere:
//
//   - FORWARD: `data={option()/graph()/{value}/{content}}` pushes live signal
//     data INTO the page (`window.__pyreonData` + a `pyreondata` event) with NO
//     reload; the diagram / editor re-renders in place.
//   - REVERSE: tapping a flow node, or editing the code / rich-text
//     editor, calls `window.pyreonPostMessage` -> the `onMessage` closure,
//     driving the native `selected` label / source signals.
// (Charts need no WebView: `@pyreon/charts` draws natively on every target.)
//
// FROM ONE SOURCE: a FLOW pipeline diagram + a REAL CodeMirror code editor + a
// REAL TipTap WYSIWYG. Data is a signal; bump it and every surface follows;
// edit an editor and the native source signal follows.
//
// THE HOSTS. `CODE_HOST` / `RICHTEXT_HOST` below are GENERATED
// by each package's host builder (regenerate: `bun
// scripts/gen-hosts.ts`). They are LOCAL consts because PMTC const-ref
// resolution inlines a local literal into the native `PyreonWebView(html:)`
// call (an imported const stays an unresolved reference). FlowWebView embeds
// its own self-contained host. CODE_HOST / RICHTEXT_HOST load the app-bundled editor globals (`window.CM` / `window.TT`)
// via `<script src="./assets/{cm,tt}.js">` — produce those with `bun
// scripts/gen-editors.ts` (a shipping app inlines the bundle via the
// `codemirrorScript` / `tiptapScript` option instead — offline, App-Store-safe).

import { Stack, Text, Heading, WebView } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
import { FlowWebView } from '@pyreon/flow/webview'

const CODE_HOST = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,maximum-scale=1\"><style>html,body{margin:0;padding:0;height:100%;width:100%;background:transparent}#pyreon-code,.cm-editor{height:100%;width:100%}</style></head><body><div id=\"pyreon-code\"></div><script src=\"./assets/cm.js\"></script><script>\n(function () {\n  // Wait for window.CM — the app's bundled CodeMirror may load async (an\n  // external <script src>, or injected by the native host after page load).\n  function pyreonReportHostError(msg) {\n    /* Tell the HOST, not just this page. Setting a window flag and returning\n       left every target showing a blank frame forever, with the diagnosis\n       stranded inside the very frame nobody can read from. The reverse bridge\n       is already here for ordinary events; a failure is the one message that\n       most needs it.\n\n       RETRIES, because the host installs pyreonPostMessage on load and this\n       can run first: the page's own script executes at parse time. Reporting\n       once and giving up put the message back where it started, nowhere. */\n    var left = 120;\n    (function attempt() {\n      try {\n        if (typeof window.pyreonPostMessage === 'function') {\n          window.pyreonPostMessage(JSON.stringify({ error: msg }));\n          return;\n        }\n      } catch (e) { return; }\n      if (--left > 0) setTimeout(attempt, 16);\n    })();\n  }\n  var tries = 0;\n  function waitCM() {\n    if (window.CM) { boot(); return; }\n    if (++tries > 800) { window.__pyreonCodeError = 'window.CM not provided (timed out)'; pyreonReportHostError(window.__pyreonCodeError); return; }\n    setTimeout(waitCM, 10);\n  }\n  function boot() {\n  try {\n  var CM = window.CM;\n  var el = document.getElementById('pyreon-code');\n  var cur = { value: '', language: '', readOnly: false };\n  var langComp = new CM.Compartment();\n  var roComp = new CM.Compartment();\n  var view = new CM.EditorView({\n    parent: el,\n    state: CM.EditorState.create({\n      doc: '',\n      extensions: [\n        CM.basicSetup,\n        langComp.of([]),\n        roComp.of(CM.EditorState.readOnly.of(false)),\n        CM.EditorView.updateListener.of(function (u) {\n          if (!u.docChanged) return;\n          var v = u.state.doc.toString();\n          // Loop guard: skip the echo of a value WE pushed (cur.value set\n          // BEFORE dispatch below).\n          if (v === cur.value) return;\n          cur.value = v;\n          if (typeof window.pyreonPostMessage === 'function') {\n            try { window.pyreonPostMessage(JSON.stringify({ value: v })); } catch (e) {}\n          }\n        }),\n      ],\n    }),\n  });\n  function apply() {\n    var d = window.__pyreonData;\n    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }\n    if (!d || typeof d !== 'object') return;\n    if (typeof d.value === 'string' && d.value !== cur.value) {\n      cur.value = d.value;\n      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: d.value } });\n    }\n    if (d.readOnly !== undefined && !!d.readOnly !== cur.readOnly) {\n      cur.readOnly = !!d.readOnly;\n      view.dispatch({ effects: roComp.reconfigure(CM.EditorState.readOnly.of(cur.readOnly)) });\n    }\n    if (d.language !== undefined && d.language !== cur.language && typeof CM.languageFor === 'function') {\n      cur.language = d.language;\n      view.dispatch({ effects: langComp.reconfigure(CM.languageFor(d.language) || []) });\n    }\n  }\n  window.addEventListener('pyreondata', apply);\n  apply();\n  } catch (e) { window.__pyreonCodeError = String(e && e.stack || e); }\n  }\n  waitCM();\n})();</script></body></html>"

const RICHTEXT_HOST = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,maximum-scale=1\"><style>html,body{margin:0;padding:0;height:100%;width:100%;background:transparent}#pyreon-richtext,.ProseMirror{height:100%;width:100%;outline:none;box-sizing:border-box;padding:8px}</style></head><body><div id=\"pyreon-richtext\"></div><script src=\"./assets/tt.js\"></script><script>\n(function () {\n  function pyreonReportHostError(msg) {\n    /* Tell the HOST, not just this page. Setting a window flag and returning\n       left every target showing a blank frame forever, with the diagnosis\n       stranded inside the very frame nobody can read from. The reverse bridge\n       is already here for ordinary events; a failure is the one message that\n       most needs it.\n\n       RETRIES, because the host installs pyreonPostMessage on load and this\n       can run first: the page's own script executes at parse time. Reporting\n       once and giving up put the message back where it started, nowhere. */\n    var left = 120;\n    (function attempt() {\n      try {\n        if (typeof window.pyreonPostMessage === 'function') {\n          window.pyreonPostMessage(JSON.stringify({ error: msg }));\n          return;\n        }\n      } catch (e) { return; }\n      if (--left > 0) setTimeout(attempt, 16);\n    })();\n  }\n  var tries = 0;\n  function waitTT() {\n    if (window.TT && typeof window.TT.createEditor === 'function') { boot(); return; }\n    if (++tries > 800) { window.__pyreonRichTextError = 'window.TT not provided (timed out)'; pyreonReportHostError(window.__pyreonRichTextError); return; }\n    setTimeout(waitTT, 10);\n  }\n  function boot() {\n  try {\n  var el = document.getElementById('pyreon-richtext');\n  var cur = { content: null, editable: true };\n  var lastPushed = null; // JSON string of content WE last pushed (loop guard)\n  var editor = window.TT.createEditor(el, {\n    content: null,\n    editable: true,\n    onUpdate: function (json) {\n      var s;\n      try { s = JSON.stringify(json); } catch (e) { return; }\n      // Loop guard: skip the echo of content WE pushed.\n      if (s === lastPushed) return;\n      cur.content = json;\n      if (typeof window.pyreonPostMessage === 'function') {\n        try { window.pyreonPostMessage(JSON.stringify({ content: json })); } catch (e) {}\n      }\n    }\n  });\n  function apply() {\n    var d = window.__pyreonData;\n    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }\n    if (!d || typeof d !== 'object') return;\n    if (d.content !== undefined) {\n      var s;\n      try { s = JSON.stringify(d.content); } catch (e) { s = null; }\n      if (s !== null && s !== JSON.stringify(cur.content)) {\n        cur.content = d.content;\n        lastPushed = s;\n        editor.setContent(d.content);\n      }\n    }\n    if (d.editable !== undefined && !!d.editable !== cur.editable) {\n      cur.editable = !!d.editable;\n      editor.setEditable(cur.editable);\n    }\n  }\n  window.addEventListener('pyreondata', apply);\n  apply();\n  } catch (e) { window.__pyreonRichTextError = String(e && e.stack || e); }\n  }\n  waitTT();\n})();</script></body></html>"

/** A ProseMirror node: a branch has `content`, a leaf has `text`. */
type PMNode = { type: string; content?: PMNode[]; text?: string }

export function VizApp() {
  const selected = signal('Tap a flow node, or edit an editor')
  // The code/rich-text editors are driven by these signals over the FORWARD
  // bridge (bump them and the hosted editor's document updates in place). The
  // REVERSE edit fires `onMessage` with the new value/JSON as a raw string —
  // here it just updates the `selected` label (native-clean: no JSON.parse,
  // matching the flow panel). To drive a TYPED native signal from an
  // edit, use `<CodeWebView onChange>` / `<RichTextWebView onChange>` (they
  // parse the payload on web — see each package's /webview browser tests).
  const source = signal('function greet(name) {\n  return "Hello, " + name\n}')
  // Annotated, and the annotation is load-bearing rather than documentation. A
  // ProseMirror document is a heterogeneous tree — the branch node carries
  // `content`, the leaf carries `text` — so there is no single struct to
  // synthesize from the literal alone, and without a type to unify them the
  // Swift emit built one struct per level and could not put a leaf inside a
  // branch's array. `PMNode` supplies exactly the missing information: one node
  // type whose two shapes are optional fields.
  const doc = signal<PMNode>({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit me — this is a real TipTap editor in a WebView.' }] }] })

  return (
    <Stack gap={16}>
      <Heading>Multiplatform viz — a flow + a code editor + a WYSIWYG, one source, three targets</Heading>
      <Text>{selected()}</Text>

      <Text>Pipeline — flow diagram</Text>
      <FlowWebView
        graph={{ nodes: [{ id: 'ingest', position: { x: 0, y: 0 }, data: { label: 'Ingest' } }, { id: 'transform', position: { x: 220, y: 0 }, data: { label: 'Transform' } }, { id: 'store', position: { x: 110, y: 130 }, data: { label: 'Store' } }, { id: 'serve', position: { x: 330, y: 130 }, data: { label: 'Serve' } }], edges: [{ source: 'ingest', target: 'transform' }, { source: 'transform', target: 'store' }, { source: 'transform', target: 'serve' }] }}
        commands={[{ id: 'initial-fit', type: 'fit-view' }]}
        background="#f7f8fa"
        onSelect={(node) => selected.set('Node: ' + node.id)}
        onEvent={(event) => selected.set('Flow event: ' + event.type)}
        onError={(error) => selected.set('Flow error: ' + error.message)}
      />

      <Text>Code editor — real CodeMirror in a WebView</Text>
      <WebView
        html={CODE_HOST}
        data={{ value: source(), language: 'javascript' }}
        onMessage={(m) => selected.set('Code edited: ' + m)}
      />

      <Text>Rich text — real TipTap WYSIWYG in a WebView</Text>
      <WebView
        html={RICHTEXT_HOST}
        data={{ content: doc() }}
        onMessage={(m) => selected.set('Doc edited: ' + m)}
      />
    </Stack>
  )
}
