---
'@pyreon/hooks': minor
---

Add `useLinking()` — open an external URL in the platform browser (`openUrl`). On the web it uses `window.open`; the PMTC native compiler lowers it to `PyreonLinking` on iOS (`UIApplication.shared.open`) and Android (`Intent.ACTION_VIEW`).

The third imperative platform-API hook in the multiplatform (M3) track, reusing the recognition → emit → runtime pipeline from `useShare` (same Context + `startActivity` shape on Android). Behavioral R4: the counter example's iOS XCUITest asserts the app leaves the foreground when the Open button hands a URL to the OS.
