// The GUEST bundle for hosting @pyreon/rich-text 1:1 on native.
//
// @pyreon/rich-text is a ProseMirror/TipTap editor — a web rendering engine
// that can't be reimplemented as a native view, but runs 1:1 on iOS/Android by
// being hosted in a `<WebView>` (WKWebView / Android WebView). This file is the
// SAME editor code, built to a self-contained bundle (`build-webview-bundle.ts`
// → `webHostDocument`) and run inside that WebView. `connectWebHost` bridges the
// ProseMirror JSON both ways:
//
//   host → guest:  <WebView data={doc}>  →  editor.json.set(doc)
//   guest → host:  editor content changes →  <WebView onMessage> (JSON string)
//
// Plain TS (no JSX) so it bundles with a bare esbuild pass — it mounts the
// editor into `#root` via the engine's own mount, no Pyreon runtime-dom needed.

import { effect } from '@pyreon/reactivity'
import { connectWebHost } from '@pyreon/primitives'
import { createRichTextEditor } from './editor'
import type { JSONContent } from './types'

const host = connectWebHost<JSONContent>()
const root = typeof document === 'undefined' ? null : document.getElementById('root')

if (root) {
  const initial = host.data()
  const editor = createRichTextEditor(initial ? { content: initial } : {})
  void editor._mount(root)

  // host → guest: apply a pushed document. Guard the echo so applying a remote
  // update doesn't immediately emit it straight back.
  let applyingRemote = false
  host.onData((next) => {
    if (!next) return
    applyingRemote = true
    editor.json.set(next)
    applyingRemote = false
  })

  // guest → host: emit the document as a JSON string whenever it changes
  // (skip the change we just applied from the host).
  effect(() => {
    const json = editor.json()
    if (!applyingRemote) host.emit(JSON.stringify(json))
  })
}
