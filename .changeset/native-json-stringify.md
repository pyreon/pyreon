---
'@pyreon/native-compiler': minor
'@pyreon/native-cli': minor
---

feat(native): `JSON.stringify(x)` lowers to native serialization

`JSON.stringify(x)` — the SAFE half of the JSON gap — now lowers to SwiftUI + Compose instead of warning: Swift `String(data: try! JSONEncoder().encode(x), encoding: .utf8) ?? ""`, Kotlin `Json.encodeToString(x)`. Emitted structs are already `Codable` / `@Serializable`, and scalars/arrays conform too, so serialization has a target on both platforms; `try!` is safe because a Codable value never throws on encode. The native-cli adds `import kotlinx.serialization.encodeToString` for the real device build (the kotlinc stub fakes it as a `Json` member, so the validate gate passed without it — the classic stub-masks-a-missing-import case).

`JSON.parse` still emits a named warning: it throws on malformed input, which needs a native error model (`try`/`throw` lowering) PMTC does not carry yet — a tracked follow-up. Decode typed API responses via `useFetch<T>` instead.

Verified end-to-end against real swiftc + kotlinc (object and array-of-structs); bisect-verified.
