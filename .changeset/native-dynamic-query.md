---
'@pyreon/native-compiler': minor
'@pyreon/query': minor
---

Lower dynamic `useQuery` to native (SwiftUI + Compose). The v1 emit only crossed a STATIC queryKey + an inline `fetch('<url-literal>')` queryFn; this closes the common real-app shapes:

- **Runtime `queryKey`** — a `queryKey` array with non-literal parts (`['user', userId]`, `['k', id()]`) now builds a RUNTIME cache key. SwiftUI's `@State` default can't reference another property (a prop/signal), so the query constructs KEYLESS and is re-keyed in the async harness via a new `PyreonQuery.setKey(_:)`, with the harness KEYED on the computed string (`.task(id:)` / `LaunchedEffect(key)`) so a key change re-keys the cache and re-fetches — matching the web's reactive queryKey.
- **Templated fetch URL** — `queryFn: () => fetch(`/users/${userId}`)` emits native string interpolation inside the harness (`self`/params in scope), through `URLSession`/`readText` or PyreonHttp exactly as the literal path does.
- **Direct-value queryFn** — `() => <expr>` / `async () => <expr>` (no fetch, no await) resolves the computed value directly (no URLSession/decode).

Both backends emit byte-identical shapes and typecheck against real `swiftc`/`kotlinc`. Static literal-key queries are unchanged (byte-identical `.task {}` / `LaunchedEffect(Unit)`). Anything still beyond scope — a non-array queryKey, a `fetch(<call-expression>)` URL, an `await`/multi-statement direct-value body, a function-reference queryFn — stays a NAMED warning rather than mis-lowering.
