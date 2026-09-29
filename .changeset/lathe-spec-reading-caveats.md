---
"@pyreon/lathe": minor
"@pyreon/http": minor
---

Lathe reads the spec constructs it used to leave behind. An `examples` entry that is a `$ref` (to `components.examples`, or to another file) is resolved before it becomes the `@example` and the preview argument; the bundler now treats an `examples` map as structure and only an example's `value` as data. A path item written as a `$ref` (3.1 `components.pathItems`, or shared between paths, webhooks and callbacks) is followed, with local fields winning. A `default` response with no 2xx beside it is carried through as the typed error body as well as the success type. A JSON spec's duplicate keys are reported (`duplicate-key`) with a pointer to each; `JSON.parse` still keeps the last, as every JSON reader does. A `trace` operation is reported (`unsupported-method`) rather than dropped silently: the Fetch standard forbids the method. Swagger 2: per-operation `schemes` that exclude the client's scheme become that operation's own servers on the document's host, and a query or form `collectionFormat: tsv` is carried as a new `tabDelimited` style.

`@pyreon/http`: `QueryStyle` and `FormFieldEncoding` accept `tabDelimited`, which joins an array with a tab (Swagger 2's `collectionFormat: tsv`).
