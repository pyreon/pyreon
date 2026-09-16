---
'@pyreon/native-compiler': patch
---

Chart flags the native emit honours only as literals (`dataZoom`, `navigator`, `brush`, `horizontal`, `universalTransition`, `updateAnimation`) now warn by name when present but not statically resolvable — a prop, a signal read, a computed used to lower silently as off, so the web build honoured the value and the device build quietly did not.
