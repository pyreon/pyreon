---
'@pyreon/cli': patch
---

`pyreon upgrade` gains the `runtime-dom-render-to-mount` codemod: it switches the removed `render` (an alias of `mount`) to `mount` in imports from `@pyreon/runtime-dom`, renaming the references. When a file declares another `render` or `mount`, it imports `mount as render` instead and leaves the body untouched.
