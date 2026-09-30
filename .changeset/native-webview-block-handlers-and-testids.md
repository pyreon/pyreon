---
'@pyreon/native-compiler': patch
---

Two silent drops on every WebView-family host (`<WebView>`, `<FlowWebView>`), on both iOS and Android:

- A block-bodied handler — `onMessage`/`onEvent`/`onSelect`/`onError` written as `(e) => { a.set(…); b.set(…) }` — lowered to an EMPTY closure. The arrow's statements live in `stmts`, and the message-handler emitter read only `body`. Every statement now emits, through the same generic action emitter `onPress` uses (multi-statement, `async`, handler-local consts included).
- `data-testid` (and the rest of the generic layout tail: `padding`/`margin`, a11y props) never reached these hosts, so none was selectable by XCUITest or `onNodeWithTag`. The tail now runs on every host and skips the props the host lowers itself — `background` on a hosted view is the page's background, not a view token.

Both found by the first real device consumer of `@pyreon/flow/webview`, which now runs in both device lanes.
