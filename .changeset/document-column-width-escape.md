---
'@pyreon/document': patch
---

fix(document): `TableColumn.width` broke out of the style attribute

`width` is typed `number | string` and a string is documented input, so it
reached a `style` attribute raw — while every sibling in the same template
literal was guarded (`sanitizeColor` on the background and colour, the escaped
header). A value of `1px" onmouseover="alert(1)` closed the attribute early and
became an event handler:

```html
<th style="font-weight:bold;width:1px" onmouseover="alert(1);padding:8px">
```

Both the `html` and `email` renderers carried it; `sanitizeStyle` was already
imported in one of them. Severity depends on provenance — developer-authored
columns cap it low, but a tenant config or a user-saved view makes it stored
XSS.
