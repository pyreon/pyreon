---
'@pyreon/elements': patch
---

`useOverlay` now restores keyboard focus to the opener when an overlay
closes. Non-modal overlays (dropdown / popover / tooltip) previously
dropped focus at the top of the document on dismiss — `_prevFocusEl` was
declared but never used. `showContent` now captures the active element
(typically the trigger) and `hideContent` returns focus to it **only**
when focus is still inside the closing overlay (or was lost to
`<body>`/null); if the user deliberately moved focus to another control,
it is left there. Modal overlays already got this from native
`<dialog>.showModal()`. Real-Chromium regression-locked.
