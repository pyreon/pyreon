---
'@pyreon/compiler': patch
---

A spread on a DOM element compiles the same way whether the element is a template or goes through `h()` (a self-closing element, an element with a component child, every server render). The `h()` path left the spread argument as written, so `<div {...{ onClick: () => count.set(count + 1) }} />` set the signal to its own source text plus "1", `"data-n": count + 1` rendered the signal's source, and a prop-derived const read its setup value. The argument is now compiled like the template path's: signals are read and prop-derived consts inlined. A bare signal property (`{...{ title: count }}`) stays the signal on both paths, so it remains a live binding; an `on*` or `ref` property is read (`{...{ onClick: handlerFor }}` binds the handler the computed returns).
