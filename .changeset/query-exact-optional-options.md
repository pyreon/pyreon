---
'@pyreon/query': patch
---

`useMutation(endpoint.mutation({ invalidates }))` now typechecks with `exactOptionalPropertyTypes` (on in `@pyreon/typescript`'s preset). `MutationOptions.invalidates` and the optional options of `useSubscription`, `useStream` and `useMutationState` accept an explicit `undefined`, so options built by `@pyreon/http`'s endpoint bridge, or forwarded conditionally, are no longer rejected.
