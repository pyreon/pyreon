---
'@pyreon/http': minor
---

Endpoint paths: `\:` now writes a LITERAL colon, for paths such as Google-style custom verbs (`'POST /v1/:name\\:cancel'`). Without it an unescaped `:cancel` read as a second parameter the caller could never supply. The type-level `PathParamNames` now mirrors the runtime matcher exactly: it honours the escape, stops a parameter name at the first non-identifier character (`/f/:name.json`, `/f/:a-:b`), and finds parameters that do not start their segment (`/f/file:id`) — all shapes where the type and the runtime used to disagree.
