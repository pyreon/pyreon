---
"@pyreon/hooks": minor
---

Add `useAppState()` — a reactive app-lifecycle phase hook (`'active'` | `'inactive'` | `'background'`).

On the web it tracks `document` visibility + focus; it also compiles to native via the Pyreon Multi-Target Compiler — `const state = useAppState()` lowers to a `PyreonAppState` container (SwiftUI `@Observable` on iOS via `UIApplication` lifecycle notifications, Compose `MutableState` on Android via an app-injected `ProcessLifecycleOwner` source), read as `state()` from one shared source. Use it to pause a live poll while backgrounded or dim UI while inactive.
