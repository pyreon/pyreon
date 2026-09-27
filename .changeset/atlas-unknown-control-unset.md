---
'@pyreon/atlas': patch
---

A prop whose type Atlas cannot classify (an object, a VNode, a union of shapes)
now starts UNSET in the workbench instead of as an empty string. `''` is a value
such a component never expects: a generated `@pyreon/lathe` preview read
`data: ''` as "render this" and showed a record of dashes instead of requesting
its data. String props still start empty; a content seed still wins.
