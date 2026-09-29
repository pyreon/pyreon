---
'@pyreon/lint': patch
---

`pyreon/no-window-in-ssr` no longer reports a NAME that merely spells a browser global. A class method called `document()`, a class field `navigator = …`, getters/setters, auto-accessors, their `abstract` twins, enum members, statement labels and `export { x as window }` aliases are member/declaration names, not references to the global, and were reported as SSR hazards. Computed keys (`[document.title]()`) and reads inside those members' bodies are still reported.
