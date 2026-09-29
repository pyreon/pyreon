---
'@pyreon/hooks': patch
---

Android `PyreonWebView`: a new opt-in `PyreonWebViewRendering.softwareLayer`
flag. When set, it draws hosted WebViews on a software layer. The default is
unchanged (hardware). It exists for GPU-less emulators. On the SwiftShader
emulator, hardware WebViews intermittently leave the whole window unpainted,
and instrumented tests set the flag in `@Before`.
