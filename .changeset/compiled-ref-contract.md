---
'@pyreon/compiler': patch
'@pyreon/runtime-dom': patch
---

A `ref` on an element of compiled JSX now behaves as it does on the `h()` path. The element it receives belongs to the page document, so `el.ownerDocument.defaultView` is the window; it used to be the template's inert document, which broke code that reads the window from the element, such as `@pyreon/virtual`'s scroll observer. On unmount the ref now receives `null` (a callback ref is called with `null`, an object ref's `current` is cleared); compiled refs used to keep the detached element. Elements built by `createTemplate` are owned by the page document too.
