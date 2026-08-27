---
"@pyreon/storage": patch
---

fix(storage): a malformed cookie no longer breaks all cookie reads

`parseCookies` (behind every `useCookie` read) called `decodeURIComponent(value)`
on each cookie value with no guard. `decodeURIComponent` throws `URIError` on a
malformed percent-escape (a bare `%`, or `%` not followed by two hex digits), so
a SINGLE bad entry anywhere in `document.cookie` threw out of `parseCookies` and
broke EVERY cookie read app-wide.

`document.cookie` mixes in cookies set by any code on the origin — third-party
scripts, a server reflecting user input un-encoded, subdomains — so this is
realistically reachable and is an availability (DoS-shaped) bug, not just a
theoretical edge. Pyreon's own write side encodes correctly, so it only bites on
cookies set by other code, which is exactly what the jar mixes in.

The decode is now wrapped: a malformed value falls back to its raw string so
every other cookie still reads. Bisect-verified: without the guard, a jar with
one incomplete escape throws `URI malformed` and the good cookies read their
defaults; with it, they read their real values.
