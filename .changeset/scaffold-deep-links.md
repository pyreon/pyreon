---
"@pyreon/create-multiplatform": minor
---

Generated apps can be opened by URL out of the box (#3984). The iOS host forwards `onOpenURL` and universal links to `PyreonDeepLink`, the Android host forwards the launch intent and `onNewIntent` (the activity is now `singleTop`), and both register a URL scheme, which defaults to the project's identifier (`my-app` becomes `myapp://`) and can be chosen with `--scheme`. Previously the runtime could receive a link but the generated hosts never called it and declared no scheme, so every app had to hand-edit the Swift, the Kotlin and the manifest. Verified on an iOS 18 simulator and an Android API 35 emulator, cold start and warm. Verified web links (universal links / `autoVerify` app links) are not generated: they need a domain you control.
