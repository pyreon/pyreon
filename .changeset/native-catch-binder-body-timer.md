---
'@pyreon/native-compiler': patch
---

Native: a bare `catch { … }` no longer shadows a signal named `error` on iOS. Swift's bare `catch` binds an implicit `error`, so `error.set('failed')` became an assignment to that immutable binding and failed to compile. The emit is now `catch _`. A `const id = setInterval(…)` or `setTimeout(…)` written directly in a component body is now named in a warning. On the web the body runs once, but on iOS and Android it runs again on every update, so the timer restarted each time and a `clearInterval(id)` started a new timer before clearing it. The warning points to `onMount` or a handler that stores the id in a signal.
