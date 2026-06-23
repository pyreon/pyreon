---
'@pyreon/primitives': minor
---

Add a cross-platform accessibility vocabulary (`AccessibilityProps`) to every
canonical primitive: `accessibilityLabel` and `accessibilityHidden`. These are
platform-NEUTRAL a11y props — write them once and each target lowers them to
its native a11y model (`accessibilityLabel` → web `aria-label` / iOS
`.accessibilityLabel` / Android `semantics { contentDescription }`;
`accessibilityHidden` → web `aria-hidden="true"` / iOS `.accessibilityHidden` /
Android `semantics { invisibleToUser }`).

**Web lowering ships now** (via `collectPassthroughAttrs`): a raw
`aria-label`/`aria-hidden` still wins as the explicit web override, and
`accessibilityHidden` emits the string `"true"` (never presence-only `""`,
which assistive tech ignores). The iOS/Android PMTC emit is a tracked
follow-up — until it lands, native targets render without the a11y attribute
(graceful, no crash). Prefer these over raw `aria-*` (web-only) so the same
component is accessible on every target.
