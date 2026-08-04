---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-kotlin': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/hooks': patch
---

`useFetch(url, { method, headers, body })` now reaches the wire on iOS and
Android. Every field of that init object was previously read by nobody — the
native parser only looked at the first argument — so both targets emitted a
plain GET and an app asking for a POST silently performed the wrong verb with
no diagnostic anywhere.

Requests carrying a verb, headers or a body now lower to `PyreonHttp`, which
had shipped on both runtimes with full verb support and nothing calling it:
Swift had a live `URLSession` edge no emit reached, and Android had an executor
interface whose real OkHttp implementation did not exist (`PyreonHttpOkHttp`,
new here). A non-2xx now rejects rather than being handed to the JSON decoder,
where it read as "the server sent bad JSON" instead of a 404. Values the
compiler cannot bake — a computed method, a `JSON.stringify(...)` body — now
WARN loudly instead of degrading to a GET.

Two pre-existing breaks in the same container, both fixed here and both hidden
by the fact that every existing example fetches an array and reads
`data() ?? []`:

- a single-object `data()?.field` read emitted `data.field` on Swift, which
  does not compile — the inference reported the container's `data` as
  non-optional even though the web hook, Swift and Kotlin all declare it
  optional, so the member emit stripped the `?.` the author wrote;
- `error()` in call form inferred `unknown`, so `{f.error() ? … }` emitted a
  bare `Throwable?` as a Kotlin condition ("condition type mismatch").

`@pyreon/hooks`: `useFetch` takes an optional second argument (`UseFetchInit` —
`method` / `headers` / `body`), matching the native lowering.

**`useFetch` decoding on Android now matches iOS.** kotlinx.serialization's
default `Json` THROWS on a JSON key the target type does not declare; Swift's
`JSONDecoder` silently ignores it. The emit used the bare default, so the same
shared `useFetch<T>(url)` against the same server decoded fine on iOS and threw
on Android the moment the response carried one extra field — i.e. against
essentially every real API, since a server returning exactly the fields one
client declares is the exception. Decoding now goes through
`PyreonFetchJson` (`Json { ignoreUnknownKeys = true }`).

This was PRE-EXISTING and is not limited to the new verb path — the plain GET
path decoded the same way. It stayed invisible because the only device-proven
fetch fixture is a hand-written `quotes.json` whose shape matches its type
exactly; measured on a real emulator, a 200 response with one extra field
raised `JsonDecodingException: Encountered an unknown key 'contentType'` while
the identical iOS run passed.

Deliberately scoped: `ignoreUnknownKeys` only. NOT `isLenient` (malformed JSON
is a real error worth surfacing) and NOT `explicitNulls = false`.
