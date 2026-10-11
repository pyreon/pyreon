---
"@pyreon/compiler": patch
---

Respect lexical bindings when auto-calling signals inside compiled expressions. Keep named functions and classes intact, restore outer signals after block, loop and catch scopes, retain function-scoped var bindings, and transform class field and method values consistently in both backends. Inline prop-derived computed object keys on the native backend so they continue reading current props.
