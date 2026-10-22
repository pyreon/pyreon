/**
 * The conventional filename of the host page `<RichTextWebView>` loads when the app did not hand it an engine.
 *
 * Shared by the JS component (web: an `<iframe src>` resolved against the served root) and the native lowering (a
 * `<WebView src>` resolved against the app bundle), so ONE name addresses the same page on every target.
 * `pyreon-native assets --target=<ios|android|web>` builds it from the app's installed engine.
 */
export const RICH_TEXT_HOST_FILENAME = 'pyreon-richtext-host.html'
