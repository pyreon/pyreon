---
'@pyreon/native-compiler': patch
---

Name an unlowered Pyreon export (or JavaScript global / JS-only method) that is called inside a template literal. A JS template literal lowers to a Swift `\(…)` / Kotlin `${…}` string interpolation, and the verbatim-survival check stripped string literals whole, interpolations included — so `` `<script>${escapeJsonForScript(json)}</script>` `` compiled to a call to a function neither platform defines, with no warning. Interpolated expressions are now read as code, and the call gets the same named "has NO native lowering" warning as one outside a string.
