/**
 * `@pyreon/code/native-plugin` — how the CodeMirror editor crosses to SwiftUI and Compose.
 *
 * It does not compile CodeMirror: that is a DOM engine. The plugin lowers `<CodeWebView>` (from
 * `@pyreon/code/webview`) to a native `<WebView>` and builds the bundled page it loads, from the app's own installed
 * CodeMirror. `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a source file
 * imports `@pyreon/code`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { codePlugin, codePlugin as default, codeWebViewLowering } from './native-plugin/plugin'
export { CODE_HOST_FILENAME } from './native-plugin/lowering'
