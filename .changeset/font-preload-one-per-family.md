---
'@pyreon/zero': patch
---

The self-hosted font preload now covers every family. A variable font serves all its weights from one file, so the CSS repeats that file for each weight; the preload took the first blocks and could preload one family's file twice while never preloading the next family. On pyreon.dev that left the display font (Space Grotesk) to swap in late and re-wrap the hero headings (layout shift up to 0.36). It now picks one file per family, never the same file twice.
