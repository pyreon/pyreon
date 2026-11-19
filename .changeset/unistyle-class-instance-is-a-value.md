---
'@pyreon/unistyle': patch
---

A non-plain object in a responsive theme (a styler `css` tagged-template result) is now one value, not a breakpoint map. `normalizeTheme` and `transformTheme` used to walk such an object's own keys as breakpoints, so an Element's `css={css`…`}` came out empty at every breakpoint and was silently dropped. Arrays and plain objects are unchanged.
