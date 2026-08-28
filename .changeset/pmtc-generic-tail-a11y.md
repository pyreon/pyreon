---
'@pyreon/native-compiler': minor
---

`<Link>` and `<Modal>` now carry `accessibilityLabel`, `accessibilityHidden` and
`data-testid` like every other primitive.

Both return before the generic modifier tail that applies those, so they were
dropped silently: an `accessibilityLabel` on a link was unread by VoiceOver and
TalkBack alike, and a `<Modal>` on Android had no test tag, making it
unselectable by `onNodeWithTag`.

The a11y lowering is now a shared helper rather than a copy in each emitter, and
a matrix spec asserts all 15 primitives × 3 cross-cutting props × 2 targets — so
a primitive that skips the tail fails at build time instead of surfacing months
later as an accessibility bug nobody is looking for.
