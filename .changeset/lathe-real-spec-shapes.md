---
'@pyreon/lathe': patch
---

Fix four emit bugs found by running GitHub's OpenAPI document through the
generator and typechecking the output.

12.9 MB, 973 models, 1222 operations. All four produced code that read
perfectly and did not compile — which is the point of a hostile spec: you do
not think to write the shapes that break you.

- **A one-member `oneOf`.** `s.union` requires at least two members; a
  one-member union is just that member, and now collapses to it.
- **A `discriminator` whose members are not all objects.**
  `GET /repos/{}/contents/{}` discriminates over a set including an ARRAY
  branch, and `s.discriminatedUnion` takes object schemas only. It degrades to
  a plain union, with a note saying why.
- **A `$ref` in a PARAMETER's schema.** Only response and body refs were
  collected, so a model named in the args type was never imported.
- **An empty `oneOf`/`anyOf`** already degraded to `unknown` safely, but
  silently. It now says so.

Measured on that spec after the fixes: parse 54ms, generate 80ms, 96 files,
2.8 MB of output, 75 MB peak heap — and the emitted client typechecks with
zero errors.
