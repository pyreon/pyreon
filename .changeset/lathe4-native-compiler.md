---
'@pyreon/native-compiler': patch
---

Endpoint path templates honour `@pyreon/http`'s `\:` literal-colon escape, so a custom-verb path (`/v1/:name\:cancel`) bakes the same URL natively as on the web instead of demanding a phantom `cancel` parameter and staying web.
