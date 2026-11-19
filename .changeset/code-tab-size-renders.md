---
'@pyreon/code': patch
---

`createEditor({ tabSize })` now sets the rendered width of a tab character. It set only the indent unit, so a tab always rendered 4 columns wide, including at the default `tabSize` of 2.
