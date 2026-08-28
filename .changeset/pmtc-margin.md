---
'@pyreon/native-compiler': minor
---

`margin`, `marginX` and `marginY` now lower on `<Stack>`, `<Inline>`, `<Layer>`
and `<Scroll>`. They produced no native output at all before — typed and
documented on the shared `BaseLayoutProps`, and claimed in scope by the Swift
emitter's own docblock, but never implemented on either target. A layout written
with margin rendered flush on iOS and Android while the web showed it spaced,
with no warning.

The two frameworks place it in opposite positions, and both are locked: SwiftUI
modifiers wrap outward so margin is appended last (after background, radius and
the `style` block); Compose's chain applies outside-in so margin is prepended,
ahead of the content padding.

Also fills three gaps in the Swift validation stub — `padding(_:_:)`,
`cornerRadius`, and `ScrollView`'s axes init — which were narrower than SwiftUI,
so `paddingX`/`paddingY`, `radius` and `<Scroll axis>` had never been compiled
by the gate at all despite shipping for months.
