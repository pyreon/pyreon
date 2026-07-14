---
"@pyreon/hooks": minor
---

feat(hooks): `useFocusTrap` gains an optional second argument — `active` (arm/disarm the trap reactively without unmounting, via a getter or the positional shorthand `useFocusTrap(getEl, () => isOpen())`) and `initialFocus` (move focus into the container on activation: `true` for the first tabbable, or a selector / element / getter; default off, backward-compatible). The focusable query is now spec-grade: it includes `contenteditable`, `audio`/`video[controls]`, and `details > summary`; filters `display:none` / `visibility:hidden` / `[hidden]` / `inert` / disabled / zero-size nodes (via `Element.checkVisibility` in real browsers); and orders positive-`tabindex` first. The trap now only acts while focus is inside its container, so nested traps no longer fight. Fully backward-compatible — the existing single-argument call is unchanged. Adds a real-Chromium browser test for the focus / Tab-cycling / visibility semantics happy-dom can't verify.
