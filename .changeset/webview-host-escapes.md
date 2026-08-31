---
'@pyreon/code': patch
'@pyreon/rich-text': patch
'@pyreon/flow': patch
---

Close two escapes in the WebView host page that could not do what they claimed

The host-page builders wrote a `background` value into a `<style>` body with `&quot;` escaping and an inlined engine bundle into a `<script>` body with a `</` → `<\/` replacement. Both are the wrong escape for their context.

`<style>` is a RAW-TEXT element: character references are never decoded inside it, so `&quot;` was inert and a `</style>` in the value closed the element and put everything after it into the document. A real CSS colour or gradient never contains `<`, `>`, or a quote, so those are dropped now — lossless for every valid value, and `background: '#0b0d12'` and `rgb(11 13 18 / 80%)` still reach the sheet verbatim.

For the script body, `</` → `<\/` stops the element being CLOSED but not the tokenizer entering the script-data-DOUBLE-escaped state, which it does on `<!--` followed by `<script`. In that state the page's own literal `</script>` no longer ends the element and the rest of the document becomes script content. `<!--` is broken too now. Both replacements are identity escapes in the string and regex contexts a bundle actually contains these bytes in (`\/` is `/`, `\-` is `-`), so the JS is unchanged; the one shape they alter is an Annex-B `<!--` HTML-like comment in code position, which no bundler emits.

A `<script src>` URL is now escaped for its attribute context (`&` first, then `"` and `<`) rather than `"` alone.

These are developer-supplied options rather than request data, so this is defence-in-depth — but a PR earlier in this cycle hardened these exact functions for the JS-string context and left both of these, and an app deriving a theme colour from content would have been exposed. `@pyreon/charts` has the same two shapes and is deliberately left alone here — it is under active change.
