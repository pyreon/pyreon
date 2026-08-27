---
'@pyreon/native-cli': minor
---

`<WebView src="page.html">` can finally be given a file

Both native runtimes have always resolved a `<WebView src>` as a BUNDLED file —
`Bundle.main` on iOS, `file:///android_asset/<src>` on Android — and nothing
could put a file there. The assets pipeline handled images and fonts only, so
the runtimes advertised a capability the build had no way to feed, and every
`<WebView>` in shared source had to inline its whole page as a string.

`assets/webhost/*.{html,js,css}` now materializes to the place each target's
resolver actually reads. The filename is preserved verbatim on every target,
because it IS the contract: `src="chart.html"` must find `chart.html`.

This is the missing route for the four webview-hosted packages (charts / code /
flow / rich-text), whose host page is produced at BUILD time and so cannot
appear in lowered source.
