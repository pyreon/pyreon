---
'@pyreon/native-compiler': patch
---

Two emit bugs that compiled with no warning (#4251):

- A `catch` written without a binding no longer shadows your own identifiers. Swift bound a bare `catch`'s error to an implicit `error`, so a signal named `error` assigned in the catch body failed `swiftc` ("cannot assign to value: 'error' is immutable"); it now emits `catch _`. Kotlin's generated binding (`pyreonCaught`) is now named clear of every identifier the catch body uses.
- A timer started directly in a component body (`const id = setInterval(fn, ms)`, `let t = setTimeout(…)`, or a bare `setInterval(fn, ms)`) now starts once, when the view mounts, as on the web. It used to run on every SwiftUI body evaluation / recomposition, starting a new timer each time, and on Swift a later `clearInterval(id)` cleared a freshly started timer instead of the running one. A timer nested inside another body value now warns by name.
