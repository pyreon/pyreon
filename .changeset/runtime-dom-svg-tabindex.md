---
'@pyreon/runtime-dom': patch
---

`tabIndex` and the other camelCase HTML props on an SVG or MathML element are written as the lowercase attribute the HTML parser would create (`tabindex`), on the h() and compiled paths and when removing them, so the element is focusable and a hydrated reactive `tabIndex` no longer adds a second attribute. `viewBox`, `preserveAspectRatio` and the rest of the parser's camelCase SVG attributes keep their case.
