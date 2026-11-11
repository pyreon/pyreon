---
'@pyreon/core': patch
---

The URL-attribute guard (`isUnsafeUrl` / `UNSAFE_URL_RE`, shared by the client, compiled-template and SSR renderers) now also blocks `vbscript:` URLs, matching the `pyreon/no-script-url` lint rule and the router's redirect guard.
