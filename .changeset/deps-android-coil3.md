---
'@pyreon/native-cli': minor
'@pyreon/create-multiplatform': minor
'@pyreon/native-compiler': patch
---

Android remote images now use Coil 3. A remote `<Image src="http…">` emits `import coil3.compose.AsyncImage` instead of `coil.compose.AsyncImage`, and the `create-multiplatform` Android template depends on `io.coil-kt.coil3:coil-compose:3.6.3` and `io.coil-kt.coil3:coil-network-okhttp:3.6.3` instead of `io.coil-kt:coil-compose:2.7.0`.

Breaking for existing scaffolded Android apps that render a remote `<Image>`: in `android/app/build.gradle.kts`, replace `implementation("io.coil-kt:coil-compose:2.7.0")` with:

```kotlin
implementation("io.coil-kt.coil3:coil-compose:3.6.3")
implementation("io.coil-kt.coil3:coil-network-okhttp:3.6.3")
```

The network artifact is required: Coil 3 has no HTTP fetcher by default, so without it an http(s) image renders nothing.
