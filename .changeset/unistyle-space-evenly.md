---
'@pyreon/unistyle': patch
'@pyreon/coolgrid': patch
---

Fix `spaceEvenly` being typed-but-unimplemented: coolgrid's `contentAlignX` (and unistyle's shared alignment vocabulary) advertised `'spaceEvenly'` from inception, but the alignment map had no entry — the declaration silently emitted nothing. The map now emits `space-evenly`; regression-locked.
