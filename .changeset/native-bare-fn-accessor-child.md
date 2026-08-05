---
'@pyreon/native-compiler': patch
---

A bare reference to a zero-arg function in text/child position — `const shout = () => raw().toUpperCase()` used as `<Text>{shout}</Text>` — is now CALLED on both native targets, matching the inline `{() => shout()}` form and what Pyreon renders on web. Previously it emitted the function itself: Kotlin failed to compile (`function invocation 'shout()' expected`) while Swift only warned and rendered a debug description, so one shared source built on iOS and did not build on Android. A bare SIGNAL child (`{raw}`) was always correct, which is what made the gap invisible. Scoped to text/child position and arity zero — a reference in prop position (`onPress={handler}`) stays a reference.
