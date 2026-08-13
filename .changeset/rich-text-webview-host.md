---
"@pyreon/rich-text": minor
---

Add the WebView-host bundle groundwork for running `@pyreon/rich-text` (a ProseMirror/TipTap editor — a web rendering engine that can't be a native view) 1:1 on iOS/Android by hosting the same web bundle in a `<WebView>`.

- `webview-entry.ts` — the guest bundle: it mounts the editor into `#root` and wires `connectWebHost` (from `@pyreon/primitives`, shipped in #2826) so the host pushes ProseMirror JSON in (`data` → `editor.json.set`) and the editor emits changes out (`editor.json` → `onMessage`).
- `scripts/build-webview-bundle.ts` — a reusable esbuild builder that bundles a package's `webview-entry` into a single self-contained HTML page (everything inlined, no external script/link) usable as `<iframe srcdoc>` on web and `loadHTMLString` on a WKWebView / Android WebView. Reusable for every web-only-rich package (rich-text/flow/code/document).

Verified: the pipeline bundles the real editor (ProseMirror) + the bridge into a self-contained page (test in `@pyreon/test-utils`). The `<RichTextNative>` host component + device proof are the follow-up.
