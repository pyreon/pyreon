---
'@pyreon/native-compiler': patch
---

Device-assert `accessibilityLabel` on Android — it had no coverage at all.

The cross-platform prop lowers per target: iOS `.accessibilityLabel(...)`,
Android `Modifier.semantics { contentDescription = … }`. iOS has asserted its
half on-device since the a11y pass. Android asserted nothing — the counter's
instrumented test file contained no content-description query at all — so the
Compose lowering was emit-locked only, and the matrix said so (0.15, "the
Android side not device-asserted here").

The new assertion is differentiating rather than merely present: it finds the
node BY THE LABEL and asserts its text is the glyph "●", which pins the
semantics block to the element the author annotated. Asserting only that some
node carries the description would pass if the block landed on a wrapper, a
sibling, or an empty spacer.

Matrix: accessibility 0.15 → 0.3 — label lowering proven on both platforms;
`accessibilityHidden`, roles, focus order and live announcements remain
unproven on either.
