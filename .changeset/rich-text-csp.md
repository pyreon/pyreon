---
'@pyreon/rich-text': minor
---

`createRichTextEditor` works under a strict Content Security Policy. The editor injected two `<style>` elements, TipTap's base CSS and the placeholder rule, which a `style-src` without `'unsafe-inline'` refuses. The new `nonce` option sets a nonce on both, and `injectStyles: false` turns both off. The same rules ship as `@pyreon/rich-text/styles.css` to import instead.
