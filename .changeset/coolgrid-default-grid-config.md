---
'@pyreon/coolgrid': patch
---

Fall back to coolgrid's own grid defaults when the theme has no grid configuration. Under `<PyreonUI>` with an app theme that has no `breakpoints` / `grid` keys, a responsive `<Col size={[12, 6, 4]}>` was moved off-screen and a scalar `size` was ignored. Container, Row and Col now render against the default xs–xl breakpoints when the theme defines none, `columns` defaults to 12, and the Container gets the default widths when the theme has no breakpoints of its own.
