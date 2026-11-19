---
'@pyreon/zero': patch
---

With several `<ThemeToggle>`s mounted, unmounting the first one no longer stops `<html data-theme>` from following theme changes. The shared effect that applies the theme was owned by whichever toggle mounted first, so it was disposed with that toggle while the others stayed mounted. It now lives in its own scope and stops only when the last toggle unmounts.
