---
"@pyreon/compiler": patch
"@pyreon/vite-plugin": patch
---

Apply prop-derived expression substitutions and signal auto-calls together using original source positions in both compiler backends, and terminate static JSX hoists before following statements. Discover and auto-name only real island calls, preserving diagnostic examples in strings, comments and regular expressions so they cannot inject nonexistent hydration imports.
