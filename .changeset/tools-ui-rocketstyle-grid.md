---
'@pyreon/atlas': patch
'@pyreon/loom': patch
---

Styling discipline pass over both workbench UIs: no inline styles and no attrs `css` strings — every layout now lives in rocketstyle `.theme()` structured keys (the raw-string idiom was the root of the whole column-stacking bug family), loom's matrix view renders through real styled components instead of ~15 inline-styled divs, and all spacing/radii snap to a 4/8px grid (radius scale: chip 4 · control 8 · card 12 · pill 20). The only remaining `style=` usages are SVG paints (where `var()` is invalid in presentation attributes) and data-driven geometry, both documented at their sites. Device viewport presets (375/768) are deliberately exempt from the grid — they are real device widths.
