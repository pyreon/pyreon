---
'@pyreon/lathe': minor
---

Readable generated documentation and Atlas previews v2.

- Generated JSDoc now carries the operation's `description` as well as its
  summary, one bullet per parameter (location, optionality, description),
  `@deprecated` for deprecated operations, parameters, properties and schemas,
  a copyable `@example` built from the spec's own examples (else a
  deterministic sample — the same value the mocks return), and a `@see` link
  from `externalDocs`. Model interfaces carry per-field descriptions and
  examples. The `deprecated` and `description-dropped` notes are gone: both are
  honoured now.
- Generated files lose their generator-maintainer commentary: one two-line
  header, and doc blocks written for the person hovering the symbol. The
  `keys.ts` and `faker.ts` examples name symbols from the spec being generated
  rather than a placeholder `books` API.
- Previews cover every safe read: every `GET` with a JSON body, including
  detail views with path parameters (`getPetById`) and required query
  parameters, requested with the spec's example values. Login, logout, token
  and session operations are excluded, and so are password/secret fields in
  what a preview displays. A list of records renders as a table, one record as
  a description list; no more `<pre>` JSON dump. Previews take `args` and
  `data` props, and each gets a seeded "Data" scenario built from the faker
  factories (or the deterministic sample when `faker` is off).
