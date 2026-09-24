---
'@pyreon/lint': patch
---

`pyreon/no-unvalidated-request-body` now recognises the body read as a
PROPERTY, not just as a call.

The rule was written against the Fetch `Request` this framework's api routes
receive, where the body arrives through `json()` / `text()` / `formData()`.
Every other server shape a user might write in the same repo — Express, Koa,
Next's pages API, anything behind a body-parser middleware — hands it over as
an already-parsed property instead, and those are exactly the handlers where
nothing has validated it: the parser produced `any` and the annotation on the
binding is a comment.

`req.body` and `ctx.request.body` are gated on the same request-ish receiver
as the call form, so `config.body`, `msg.body` and `requestId.body` are still
not this rule's business.
