---
'@pyreon/atlas': patch
'@pyreon/mcp': patch
---

`atlas verify-browser` no longer depends on `pngjs` or `pixelmatch`. Snapshot comparison runs on Atlas's own PNG decoder (the 8-bit truecolor / truecolor+alpha shapes Chromium screenshots use, with every chunk CRC and scanline filter checked) and its own perceptual diff (the same YIQ metric and anti-aliasing detector). Verdicts are unchanged: the diff is held byte-identical to pixelmatch 7.2.0 — count and diff image — by a differential corpus of real Chromium screenshot pairs plus 400 seeded synthetic pairs recorded before the dependencies were removed.

A failing snapshot now also writes `<id>.diff.png` beside `<id>.actual.png`, marking the differing pixels in red. A baseline an image optimizer re-encoded (palette, 16-bit, sub-byte depths, interlaced) is refused with a message naming the cause instead of being decoded approximately — delete it and re-record with `--update-snapshots`.
