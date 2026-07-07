---
"@pyreon/create-multiplatform": patch
---

Scaffold WebView viz-bundle staging so `<WebView src="…">` resolves a local multi-file bundle from on-device app resources.

The generated build scripts now run `pyreon-native stage-web` (gated on a `web/` project directory, so it's a no-op when absent), which copies a flat web bundle (an `index.html` + sibling `js`/`css`) into the exact location the shipped PyreonWebView runtime resolves `src` against — iOS `WebContent/` (included as an XcodeGen `type: group` so the files flatten to the app bundle's resource root for `Bundle.main.url(forResource:)`) and Android `assets/` (`file:///android_asset/`). This keeps the whole bundle on-device (the policy-safe path) and lets the html's relative asset refs resolve. Flat-only in v1; nested subdirectories are skipped with a warning.
