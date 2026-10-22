import type { CompilerPlugin, ElementLowering } from '@pyreon/native-compiler/plugin-api'
import { NATIVE_COMPILER_PLUGIN_API_V2 } from '@pyreon/native-compiler/plugin-api'
import { buildRichTextHosts } from './host'
import { retagRichTextWebView } from './lowering'

/** `<RichTextWebView>` lowers to the generic `<WebView>` pointed at the bundled TipTap page. */
export const richTextWebViewLowering: ElementLowering = Object.freeze({
  module: '@pyreon/rich-text',
  tags: Object.freeze(['RichTextWebView']),
  retag: retagRichTextWebView,
})

/**
 * The `@pyreon/rich-text` native plugin. Only the WebView bridge crosses: TipTap / ProseMirror is a DOM editor with no
 * SwiftUI or Compose equivalent, so the same editor is HOSTED in a native WebView — the page built from the app's own
 * install, the document pushed in, edits delivered back. The rest of the package stays web-only.
 */
export const richTextPlugin: CompilerPlugin = Object.freeze({
  name: '@pyreon/rich-text',
  apiVersion: NATIVE_COMPILER_PLUGIN_API_V2,
  elements: Object.freeze([richTextWebViewLowering]),
  webHosts: buildRichTextHosts,
  // Measured: every other export of the package is a DOM editor API and failed both targets SILENTLY (a call to a
  // symbol neither runtime defines). The package left the blanket web-only list when this plugin arrived, so the
  // per-export advice is what keeps `createRichTextEditor / RichText` from compiling to nothing in silence.
  unlowered: Object.freeze({
    '@pyreon/rich-text': Object.freeze({
      advice:
        'TipTap / ProseMirror is a DOM editor, so only the `<RichTextWebView>` bridge from `@pyreon/rich-text/webview` lowers (it hosts the same editor in a native <WebView>) — host the editor with `<RichTextWebView>`, or keep `@pyreon/rich-text` in a `<Web>` branch',
      supported: Object.freeze(['RichTextWebView']),
    }),
  }),
  modules: Object.freeze(['@pyreon/rich-text']),
})
