---
"@pyreon/zero": patch
---

fix(zero): escape the JSON-LD `<script>` body in `jsonLd()` (XSS)

`jsonLd(data)` interpolated `JSON.stringify(data)` straight into a
`<script type="application/ld+json">…</script>` string. `JSON.stringify` does
NOT escape `<`, so a field built from user / CMS / DB content — a product name,
review body or article headline, i.e. the overwhelmingly common JSON-LD case —
containing `</script>` (or `<!--` / `<script`) breaks out of the element and
injects arbitrary markup into `<head>`. `jsonLd` is a public, documented helper
whose returned string is meant to be embedded raw, so this was reachable
reflected/stored XSS.

The stringified JSON is now escaped with the same recipe the framework already
uses for `stringifyLoaderData`: `<` → `<` (makes `</script`, `<!--` and
`<script` unformable) plus U+2028 / U+2029 (valid in JSON strings but literal
line terminators inside a script). Every escaped form parses back to the
original under `JSON.parse`, so the structured data is byte-identical — only its
serialized form is neutralized.

The sibling `<script type="speculationrules">` embed (`injectSpeculationRules`)
is built from a hardcoded object with no user input and is unaffected.

Bisect-verified: reverting to the raw `JSON.stringify` makes a `</script>`
payload produce two closing tags (the breakout); the test asserts exactly one.
