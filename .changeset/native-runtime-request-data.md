---
'@pyreon/native-compiler': minor
'@pyreon/http': minor
'@pyreon/query': minor
'@pyreon/hooks': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Native requests can now carry what the user entered (#3978).

- `useMutation` lowers on iOS and Android. `useMutation<T>(endpoint.mutation())` and `useMutation({ mutationFn: (vars) => endpoint({ json: vars }) })` become a `PyreonMutation` container with `mutate`, `mutateAsync`, `reset` and `data` / `error` / `status` / `isPending` / `isSuccess` / `isError` / `isIdle`. Each request is built where `mutate` is called, so it carries the values of that moment. The latest call owns the state, and `onSuccess` / `onError` / `onSettled` run in TanStack Query's order at both layers. When the view goes away nothing is written and no callback runs; the request itself is not aborted. `invalidates`, `onMutate` and `retry` produce a named warning.
- An endpoint awaited in an `async` event handler (`await signIn({ json: { email: email() } })`) lowers to the new `PyreonHttp.call`. A non-2xx rejects and ends the handler there; the failure is reported to the log instead of crashing the app on Android. A call that is not awaited is sent fire-and-forget. Reading the awaited value has no decode type natively and gets a warning pointing at `useMutation<T>`.
- Endpoint calls accept runtime values: a `json` body (serialized byte for byte like the web's `JSON.stringify`), header values, and query values. Query values are serialized at request time by the new `PyreonURL.query`, which matches the web's `buildQuery`.
- `useFetch` and a `useQuery` `fetch` accept a runtime `body` (`JSON.stringify(draft)`).
- Per-call headers now merge over an endpoint's declared headers, as the web does. Before, they replaced them. A number or boolean header value is sent as its string, and a `null` one removes the header.
- A string body sent without a content type now gets `text/plain;charset=UTF-8`, the Fetch standard default. Before, iOS, Android and the web each sent something different.
