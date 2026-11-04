---
'@pyreon/native-compiler': minor
---

`throw` and `try`/`catch`/`finally` now lower to iOS and Android in helper, handler and computed bodies, where they previously warned and were dropped. Kotlin maps them one-to-one. Swift marks a helper that lets an error escape `throws`, along with every helper that calls it without catching, and marks each call `try`. `finally` runs as a `defer`. An error that nothing catches in a closure that cannot throw, such as an event handler, terminates the app on both native targets instead of being reported as on the web, and the compiler names that position in a warning.
