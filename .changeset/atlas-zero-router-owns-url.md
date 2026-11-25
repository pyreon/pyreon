---
'@pyreon/zero': minor
---

`startClient` and `createApp` take `trailingSlash` (`'strip' | 'add' | 'ignore'`), forwarded to the client router. An app deployed as SSG directories to a static host can pass `'add'` so the router writes the URL the host serves (`/button/`) instead of one it answers only with a redirect. A new optional option; the default (`'strip'`) is unchanged.

Upgrade: none
