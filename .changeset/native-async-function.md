---
'@pyreon/native-compiler': patch
---

A component-local `async` function (`const shoot = async () => { await … }`) now lowers to a fire-and-forget `Task { … }` on iOS and `pyreonAsyncScope.launch { … }` on Android. It previously emitted a plain `func`/`fun`, which neither target lets `await` in — an uncompilable emit with no warning. An async function that returns a value, or a top-level async helper, is named in a warning instead of being mis-lowered.
