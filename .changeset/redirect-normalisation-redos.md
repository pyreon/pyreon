---
'@pyreon/router': patch
---

Fix a polynomial ReDoS introduced by the redirect-normalisation hardening in
this same PR.

The normalisation used an anchored alternation quantified over an AMBIGUOUS
character class: the `U+0000`-`U+0020` range already contains everything `\s`
adds below U+0080, so on a long run of matching characters the engine retries
the `$`-anchored branch from every position. Measured: 5k chars 13.5ms, 20k
204ms, 80k **3,563ms**. Clean quadratic.

`redirect()` targets can come straight from a `?next=` parameter, and this guard
runs on every SSR redirect, so it was reachable rather than theoretical - an
attacker sending 80k spaces burns 3.5 seconds of server CPU per request.

Replaced with an index walk: linear, no backtracking, and closer to the spec.
`<= 0x20` is exactly the "C0 control or space" set the URL parser strips, so
dropping `\s` makes it MORE faithful - a leading U+00A0 is not stripped by a
browser either, so it correctly stays part of the path.

Found by CodeQL on the PR that introduced it.
