---
'@pyreon/styler': patch
---

The class caches of dynamic styled components now key on every prop the styles read, not only on the objects they were keyed on (`$rocketstyle` / `$rocketstate` for rocketstyle components; the theme and the `$element` / `$text` bundle for the elements layer). Before, two instances with the same key shared the class of whichever rendered first, even when their styles read a prop that differed (for example `onClick` / `href`, which decide `cursor: pointer`). On a statically generated site this gave a hydrated island a different class from the one the server sent. Primitive props are compared by value, objects by identity, functions by presence, and `'x' in props` by presence. Styles that enumerate the props (a rest spread, `Object.keys`) are not cached, so read props by name.
