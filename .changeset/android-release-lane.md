---
'@pyreon/create-multiplatform': minor
---

Scaffolded Android apps gain a real release lane: a `release` signingConfig backed by `android/keystore.properties`, a `scripts/ensure-release-keystore.sh` generator (self-signed — Play App Signing re-signs store uploads, so the local key proves the full sign→install→run path credential-free; a real upload key drops into the same properties shape), `npm run release:android`, a `testBuildType` toggle so `gradle -PpyreonReleaseTests connectedCheck` re-runs the app's instrumented tests against the signed R8-minified release artifact, test-APK-only `-dontwarn` rules for androidx.test's compile-only annotations, and a project `.gitignore` (previously absent entirely — signing material was committable).
