---
'@pyreon/native-compiler': minor
---

`<Text size>`, `<Text weight>` and `<Field kind>`'s keyboard now lower to native.

All three are documented props on the CANONICAL primitives that produced no emit
on either target, with no warning:

- a heading written `<Text size="lg" weight="bold">` rendered at body size and
  regular weight on native while the web showed it large and bold
- `<Field kind="number">` raised a full QWERTY keyboard on a phone where the same
  source showed a numeric pad in a browser

Same source, a visibly different screen, and nothing said so.

Point sizes mirror the web impl's own scale (`web/Text.tsx`'s `SIZE_PX`) rather
than a new one — a scale that drifts from the web's is a divergence that looks
like a design choice. On Swift, size and weight emit as ONE
`.font(.system(size:weight:))`, because two `.font` modifiers do not compose
there (the later replaces the earlier); a custom `font` still wins. On Kotlin the
keyboard type MERGES into the existing `KeyboardOptions` rather than pushing a
second one, so an `onSubmit` imeAction and a keyboard type no longer displace
each other.

`kind="password"` continues to select masking rather than a keyboard — a masked
field keeps the platform default.
