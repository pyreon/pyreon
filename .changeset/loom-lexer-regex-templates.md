---
'@pyreon/loom': patch
---

`loom scan` no longer misreads two JavaScript shapes. A regex literal holding a quote (`/'/`) used to open a string and flip string/code state for the rest of the line, which could hide a real import or report one written inside a string. A template nested in an interpolation (`${`…`}`) used to end the outer template early and expose the inner template's text as code. Both could produce a false `phantom-dep` or miss a real dependency. Regexes are now recognised by the usual lexical rule (after an operator, an opening bracket or a keyword), and interpolations are walked as code, including nested templates, strings, comments and regexes.
