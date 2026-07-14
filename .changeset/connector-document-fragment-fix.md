---
"@pyreon/connector-document": patch
---

fix(connector-document): extract Fragment (`<>…</>`) and bare-array children instead of silently dropping them

`extractDocumentTree` dispatched each vnode by `typeof type` (string vs function) with a final `return null`. A `<>…</>` fragment compiles to `h(Fragment, …)` whose `type` is a symbol, so a fragment vnode matched no branch and its entire subtree vanished from the exported document with no error. The same silent-drop hit any wrapper component that returned multiple siblings via a Fragment, and any component returning a bare `VNodeChild[]` array. Fragments and bare-array returns are now transparent — their doc-primitive children flatten into the parent, matching DOM-element/unmarked-component transparency. This is the same silent-drop class as PR #197's metadata drop, in the same package; it survived because the connector's own suite only fed hand-rolled marked-function fixtures and never grouped siblings with `<>` or a real rocketstyle primitive. Adds real-`h(Fragment)` + real-rocketstyle-primitive regression locks.
