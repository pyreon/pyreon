---
'@pyreon/http': minor
---

Typed error bodies. An `HttpError` now carries its decoded `body` (read from a clone, so `response.raw` stays readable), and an endpoint or request can declare `errors` schemas keyed by status, range (`'4XX'`) or `default`. The thrown error's body is validated against the most specific match under the client's `validate` mode and `matched` names the key it passed; a body that fails its schema stays the same HTTP failure with `matched` undefined. New types `HttpErrorOf<E>`, `EndpointError<EP>`, `RequestFailure` and `ErrorSchemas`; `Endpoint` gains an optional fourth type parameter and an `errors` property.
