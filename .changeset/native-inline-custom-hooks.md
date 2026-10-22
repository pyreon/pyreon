---
'@pyreon/native-compiler': minor
---

Native: same-file custom hooks are inlined into the components that call them. A hook such as `function useMe(auth) { return useQuery(…) }` used to be skipped on iOS and Android ("return type couldn't be inferred"), because the hooks inside it lower to view state (`@State` / `remember`) that only exists inside a component. The compiler now puts the hook's body into each calling component, with arguments substituted for parameters and locals renamed under the caller's name, so every hook inside is recognised exactly as if written inline — and the emitted Swift and Kotlin are byte-identical to the inline form.

Each call gets its own state, a hook calling another same-file hook is inlined through, and an object result is read by destructuring (`const { count, increment: bump } = useCounter(1)`). Shapes the lexical rewrite cannot reproduce faithfully — a top-level `if` or early `return`, an argument with a cost, a shadowed parameter, an async / generic hook — are refused with a named reason instead of being guessed at.

A hook imported from a relative module (`import { useMe } from './hooks'`) is inlined the same way when the calling file is compiled from disk: its imports are added to the calling file (relative paths rebased), the types it names are copied, and a hook it calls from yet another file is inlined in turn. Before this, such a call was emitted unchanged with no warning and the native build failed on a function that does not exist natively; an imported hook that cannot be inlined (a module-level value it depends on, a name clash, a missing or unreadable module) is now always named.

A type imported from a sibling module (`import type { Order } from './types'`) is copied into the importing file for native, with the types it names in turn, so its struct exists natively; a different same-named declaration in the importing file is refused by name.
