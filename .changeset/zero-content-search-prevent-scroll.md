---
'@pyreon/zero-content': patch
---

`<Search>` no longer yanks the page to the bottom when opened.

The component focuses the search input on open to make typing immediate. The `<search>` element itself is typically mounted near the end of the document tree (e.g. at the bottom of the app shell), so the `<dialog>` rendered inside it lives in document flow at THAT position even though `.pyreon-search__backdrop` is `position: fixed`. The browser's default focus behaviour scrolls the focused input into view — which on a tall scrollable page jumps the document down by several thousand pixels (while the visible fixed backdrop stays anchored at the top).

`focus({ preventScroll: true })` opts out of the auto-scroll. The fixed backdrop already shows the dialog at the right visual position; the scroll-into-view was pure collateral damage.
