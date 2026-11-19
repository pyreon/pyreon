---
'@pyreon/core': patch
'@pyreon/elements': patch
'@pyreon/hooks': patch
---

`<Overlay type="modal">` / `useOverlay({ type: 'modal' })` now locks page scrolling only while the modal is open (it locked when the overlay mounted, so a closed modal blocked scrolling for as long as its trigger was on the page) and releases on close and on unmount, restoring the page's previous value instead of writing `''`. `parentContainer` is locked the same way. The lock is the new `lockScroll()` in `@pyreon/core`, which `@pyreon/hooks` `useScrollLock` now uses too, so an Overlay modal and a `ModalBase` dialog share one counter and never unlock the page under each other.
