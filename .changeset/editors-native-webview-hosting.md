---
"@pyreon/native-compiler": minor
"@pyreon/native-cli": minor
"@pyreon/code": minor
"@pyreon/rich-text": minor
---

The CodeMirror and TipTap editors now work in a native app. `<CodeWebView>` and `<RichTextWebView>` previously compiled to Swift and Kotlin with no warning but called a function that does not exist on either platform, so a native build failed. They now lower to a native `<WebView>` hosting the same editor, and the page it loads is built for you.

- **`@pyreon/code`, `@pyreon/rich-text`:** new `./native-plugin` entry. `<CodeWebView state onChange onError>` and `<RichTextWebView …>` lower to `<WebView src data onMessage>`. `pyreon-native assets` builds `pyreon-code-host.html` / `pyreon-richtext-host.html` from the CodeMirror or TipTap installed in the app (CodeMirror uses whichever `@codemirror/lang-*` grammars are installed; TipTap uses StarterKit). Every other export of each package warns by name, so `createEditor(...)` no longer compiles to nothing in silence.
  - New `onError` prop on both components. A host failure (engine missing, a throwing extension) now reaches the app instead of leaving a blank frame.
  - Without `html` or an engine script the components load the same conventionally named page on every target, so `pyreon-native assets --target=web` serves it on the web.
  - **Breaking, rich-text:** `onChange` now receives the document as TipTap JSON **text** (a string), not an object, and `state.content` accepts that string (or HTML) back. A native handler cannot hold a JSON object, so the string is the one shape identical on every target. Use `JSON.parse(text)` on web if you want the object.
  - The reverse channel uses plain `v:` / `c:` / `e:` prefixes instead of a JSON envelope; a custom `html` host that still posts the old envelope keeps working.
- **`@pyreon/native-compiler`:** plugins can declare `webHosts` to contribute the pages a lowered `<WebView src>` loads. The builder receives `bundleScript` on its context (bundles a host entry with the app's `esbuild` or `rolldown`; also exported as `bundleWebHostScript` from the main entry) and the plugin API gains `retagHostedWebView`. The bundler is injected rather than imported because loading the app's bundler is a computed dynamic import, which a plugin's scanned dependency graph must not contain.
- **`@pyreon/native-cli`:** `pyreon-native assets` also builds the web-host pages of every plugin the app source imports (`--app`, `--app-source`, `--no-plugins`). A missing bundler fails the command with the install instruction.
- **Fix, `@pyreon/native-compiler`:** the parameter of `<WebView onMessage={(m) => …}>` is now a `String`. `m.slice(2)` and similar were emitted verbatim on Swift (`value of type 'String' has no member 'slice'`) with no warning, while Kotlin compiled.
