---
'@pyreon/native-compiler': patch
---

An inline object type written as a generic type argument now compiles to a named struct on iOS and Android, the same way a named `interface` does.

Swift used to spell `useMutation<{ ok: boolean }>(…)` as `PyreonMutation<Bool>` and decode the reply as `Bool`, so a `{"ok":true}` response failed to decode at runtime and nothing warned. A type with more than one field became a labelled tuple, which is not `Codable`. The same happened to `useQuery`, `useInfiniteQuery`, `useStream`, `useFetch`, `useAuth`, `JSON.parse(…) as { … }` and a local's annotation. All of them now produce a `Codable` struct named after the component (`PageData`). On Kotlin, two inline type arguments in one component no longer share one data class: the second gets its own (`PageData2`). A file-scope constant annotated with an inline object type over a literal (`const R: Readonly<{ a: number }> = { a: 1 }`) now uses the literal's struct, where Swift used to annotate it `Int`. An inline object type anywhere else outside a component, such as a module-scope `signal<{ ok: boolean }>`, now produces a warning (on Swift only for a one-field shape; several fields stay a labelled tuple) that asks you to name the type. Before, it was silently retyped.
