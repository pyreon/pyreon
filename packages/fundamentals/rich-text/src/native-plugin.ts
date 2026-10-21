/**
 * `@pyreon/rich-text/native-plugin` — how the TipTap editor crosses to SwiftUI and Compose.
 *
 * It does not compile TipTap: that is a DOM engine. The plugin lowers `<RichTextWebView>` (from
 * `@pyreon/rich-text/webview`) to a native `<WebView>` and builds the bundled page it loads, from the app's own
 * installed TipTap. `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a source file
 * imports `@pyreon/rich-text`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { richTextPlugin, richTextPlugin as default, richTextWebViewLowering } from './native-plugin/plugin'
export { RICH_TEXT_HOST_FILENAME } from './native-plugin/lowering'
