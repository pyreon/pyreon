---
'@pyreon/native-compiler': minor
'@pyreon/query': patch
'@pyreon/hooks': patch
---

Native: a request header value may now be any string expression, not just a literal, in `useQuery`'s `queryFn` fetch and in `useFetch`'s `init.headers`. It is evaluated each time the request is built, which is what lets a signed-in iOS / Android app send `Authorization: Bearer <token>`. In `useQuery` that is inside the harness on every run; with the user in the `queryKey`, a sign-in refetches with the new token, exactly as on the web.

A value typed as possibly `null` is refused with a warning naming the fix (`?? ''`): native headers cannot be optional, and the web would send the literal text `null`. A non-string value is refused the same way. `useQuery` used to drop any non-literal header value with no warning at all; every value that does not cross is now named. The plugin API gains `classifyHeaderValue`, `headerValueProblem` and `sendableHeaderExprs`, so the two hooks share one rule.
