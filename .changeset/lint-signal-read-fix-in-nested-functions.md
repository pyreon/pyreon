---
'@pyreon/lint': patch
---

`pyreon/consistent-signal-read` now fixes a bare signal inside a function nested in JSX (a handler, `ref`, render prop or function child) to `count()`, on any element. The compiler reads the bare form there on every element path, so both forms compile to the same code; the rule's message no longer says the auto-call depends on the element.
