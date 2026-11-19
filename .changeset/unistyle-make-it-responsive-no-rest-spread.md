---
'@pyreon/unistyle': patch
---

`makeItResponsive` reads `theme` and the keyed prop by name instead of rest-spreading the component's props. The spread enumerated every prop, which the styler's class cache treats as "may depend on any prop", so every component styled through `makeItResponsive` (all `@pyreon/ui-components` bases) re-resolved its CSS on every mount.
