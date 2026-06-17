---
'@pyreon/compiler': patch
---

Fix a cross-backend escaping divergence: the Rust native backend left a bare
numeric "entity" like `&123;` (digits with no `#`) unescaped in static text,
while the JS backend correctly escaped the `&` to `&amp;` (per the HTML
char-ref grammar — `&123;` is not a valid reference). The two backends now
agree: `escape_html_text` recognizes a valid char-ref only as `#<dec>`,
`#x<hex>`, or `<letter><word*>` — matching the JS `escapeHtmlText` regex
exactly. Locked by 11 new cross-backend equivalence fixtures covering the
entity edge cases; bisect-verified (the fixtures diverge on the pre-fix Rust).
