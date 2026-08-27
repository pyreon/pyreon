---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

PMTC: an `@pyreon/http` endpoint whose `:param` is a RUNTIME value now lowers to iOS and Android through `useQuery`.

`useQuery<User>(() => getUser.query({ params: { id: props.userId } }))` previously warned and stayed web, because the URL was resolved as a compile-time constant and a signal read has no compile-time value. That made the most ordinary thing an API-backed screen does — fetch the record named by a prop — the one thing that did not cross. It now emits native string interpolation, and the runtime value is carried in the CACHE KEY as well as the URL, so the harness re-fetches when the value changes exactly as the web does.

The value is percent-encoded at runtime by a new `PyreonURL.encodePathParam` in both runtimes, which mirrors the web's `encodeURIComponent(String(value))` — verified by executing both shipped encoders against the real `encodeURIComponent` over a 60-case corpus (delimiters, whitespace, multi-byte UTF-8, numbers).

`useFetch` deliberately still bails: it lowers to a one-shot task with nothing to re-run it, so a runtime URL there would fetch once and freeze at that first value while the web kept re-fetching. Its warning now names `useQuery` as the fix rather than describing the limitation.
