import type { CompilerPlugin, ElementLowering } from '@pyreon/native-compiler/plugin-api'
import { NATIVE_COMPILER_PLUGIN_API_V2 } from '@pyreon/native-compiler/plugin-api'
import { buildCodeHosts } from './host'
import { retagCodeWebView } from './lowering'

/** `<CodeWebView>` lowers to the generic `<WebView>` pointed at the bundled CodeMirror page. */
export const codeWebViewLowering: ElementLowering = Object.freeze({
  module: '@pyreon/code',
  tags: Object.freeze(['CodeWebView']),
  retag: retagCodeWebView,
})

/**
 * The `@pyreon/code` native plugin. Only the WebView bridge crosses: CodeMirror is a DOM editor with no SwiftUI or
 * Compose equivalent, so the same editor is HOSTED in a native WebView — the page built from the app's own install,
 * the value and language pushed in, edits delivered back. The rest of the package stays web-only.
 */
export const codePlugin: CompilerPlugin = Object.freeze({
  name: '@pyreon/code',
  apiVersion: NATIVE_COMPILER_PLUGIN_API_V2,
  elements: Object.freeze([codeWebViewLowering]),
  webHosts: buildCodeHosts,
  // Measured: every other export of the package is a DOM editor API and failed both targets SILENTLY (a call to a
  // symbol neither runtime defines). The package left the blanket web-only list when this plugin arrived, so the
  // per-export advice is what keeps `createEditor / CodeEditor / DiffEditor / TabbedEditor` from compiling to nothing in silence.
  unlowered: Object.freeze({
    '@pyreon/code': Object.freeze({
      advice:
        'CodeMirror is a DOM editor, so only the `<CodeWebView>` bridge from `@pyreon/code/webview` lowers (it hosts the same editor in a native <WebView>) — host the editor with `<CodeWebView>`, or keep `@pyreon/code` in a `<Web>` branch',
      supported: Object.freeze(['CodeWebView']),
    }),
  }),
  modules: Object.freeze(['@pyreon/code']),
})
