---
'@pyreon/styler': patch
---

The reactive class binding of a styled component (the one that carries a rocketstyle variant, size or state) is labelled `class on <tag>` in the dev reactive graph. Its first run writes nothing, so it used to appear as an anonymous effect. Development builds only.
