---
'@pyreon/code': minor
---

`createEditor({ nonce })` and `<DiffEditor nonce>` set CodeMirror's `EditorView.cspNonce`, which makes the editor work under a strict Content Security Policy.

CodeMirror writes its theme and layout CSS into a `<style>` element in the document `<head>`. Under `style-src` without `'unsafe-inline'`, the browser refused that element: the editor rendered unstyled and every page that mounted one reported a violation. Pass the page's nonce and the element is accepted.

There is no static `styles.css` alternative, because CodeMirror generates its class names at runtime, per theme and extension.
