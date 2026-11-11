---
'@pyreon/loom': minor
---

The observatory follows the shared Pyreon theme preference: `localStorage['pyreon-theme']` (`'light' | 'dark'`), otherwise `prefers-color-scheme`, dark by default — the same rule as pyreon.dev, the docs and Atlas. It is applied before first paint, the toggle writes the shared key, and a choice made in another tab applies live. Loom's old `loom:theme` key is still read as a fallback. The palette is now the Pyreon design system's ink / paper / ember, and every text role (including text on the accent fill and the status badges) passes 4.5:1 in both modes; the light-mode faint text and the dark-mode faint text and footer separators did not.
