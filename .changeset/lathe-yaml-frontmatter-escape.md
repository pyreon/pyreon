---
'@pyreon/lathe': minor
---

Generated docs front-matter now escapes the way YAML actually does, so a spec
title carrying a quote no longer takes the page down.

`yaml()` doubled the inner quote — the CSV and single-quoted-YAML convention.
Inside a DOUBLE-quoted scalar YAML escapes with a backslash, so the doubled
form closes the scalar and opens another: `title: """x"""` is not `"x"`, it is
a parse error, and `gray-matter` (what `@pyreon/zero-content` actually reads
these pages with) rejects the whole document. A backslash in the title had the
same effect from the other direction, swallowing the closing quote. Both now
escape correctly, backslash first for the reason `mdCell` already documents.

The test that should have caught it asserted the broken spelling
(`toContain('title: "He said ""hi"""')`) — it held the emitter to a string
instead of to a contract, so it locked the bug in rather than finding it. It
now PARSES the emitted page with `gray-matter` and round-trips the value,
which is the same producer-vs-real-consumer discipline the adapter path
constants follow. Quote, backslash and colon are each covered.
