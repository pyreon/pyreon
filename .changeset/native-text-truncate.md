---
'@pyreon/native-compiler': minor
'@pyreon/native-cli': minor
---

`<Text truncate>` lowers to iOS + Android; `justify` / `wrap` now say they don't

Three documented props on the canonical primitives reached the native emit and
produced NOTHING, on either target, with no diagnostic:

- `<Text truncate>` → a plain `Text`, so a label that should ellipsize wrapped
  instead and reflowed the layout around it.
- `<Stack justify="between">` → a bare `VStack` / `Column`.
- `<Inline wrap>` → a plain `HStack` / `Row`.

`truncate` now lowers exactly on both — `.lineLimit(1).truncationMode(.tail)`
on SwiftUI, `maxLines = 1, overflow = TextOverflow.Ellipsis` on Compose (both
halves are required on each: a line bound alone clips mid-glyph).

`justify` and `wrap` now WARN. Compose could express `justify` on its own
(`Arrangement.SpaceBetween`), but SwiftUI's stacks have no equivalent, and
shipping one platform's half would put the two out of agreement — the failure
`<Transition name>` already taught us to avoid. The warning names the tag the
author wrote and points at the escape hatches that do lower.
