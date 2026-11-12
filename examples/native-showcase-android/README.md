# native-showcase-android

Android host for **Today**: compiles [`../native-showcase/src/TodayApp.tsx`](../native-showcase/src/TodayApp.tsx) to
Jetpack Compose (`app/src/main/kotlin/com/pyreon/generated/`, gitignored) before every Gradle build. The host is
`MainActivity.kt`: edge-to-edge with the content in the safe-drawing area (the same handling as #4294, so nothing sits
under the status bar on API 35+), the page colour, and a Material theme carrying the accent. Device test:
`app/src/androidTest/kotlin/com/pyreon/TodayAppInstrumentedTest.kt`. Build, run and test commands:
[`../native-showcase/README.md`](../native-showcase/README.md).
