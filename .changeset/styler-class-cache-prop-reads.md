---
'@pyreon/styler': patch
---

The rocketstyle class cache now keys on every prop a component's styles read, not only on `$rocketstyle` and `$rocketstate`. Before, two instances with the same dimension values shared the class of whichever one rendered first, even when their styles read a prop that differed (for example `onClick` / `href`, which decide `cursor: pointer`). On a statically generated site this gave a hydrated island a different class from the one the server sent.
