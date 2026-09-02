---
'@pyreon/hooks': patch
'@pyreon/server': patch
---

**`useSecureStorage` and `useDatabase` shared their store across requests on the
server.** Both back their web arm with a module-level `Map`, under comments that
reason correctly about a browser — "the secret store is app-wide, like the
Keychain it mirrors"; "module-scoped so reads and writes within one page agree".
In a browser one process serves one user, so app-wide and page-wide are the same
scope. On a server one process serves everyone, and both hooks reached that map
under SSR: `useDatabase` mirrored into it *before* its `isServer` early return
and read from it, while `useSecureStorage` had no server branch at all.

Verified by running the modules with no `document` — the real SSR arm, not a
mock: a record inserted by one render came back to the next, and a session token
written by one render was returned to the next verbatim.

Both now have an inert server arm — reads empty, `write` returns `false`,
nothing stored. That is chosen over a per-call map, which removes the leak but
makes two components in one render disagree; inert is consistent for every
caller and carries nothing across a request. It is also the honest answer: a
localStorage/Keychain mirror has nothing to mirror on a server, and secrets
needed there belong in the request context or the environment.

Also repairs a security docblock in `@pyreon/server`: the server-island fragment
renderer's SECURITY CONTRACT paragraph had been spliced into the middle of the
preceding sentence, leaving both halves reading as fragments.
