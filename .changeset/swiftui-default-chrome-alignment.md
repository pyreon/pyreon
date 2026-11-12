---
'@pyreon/native-compiler': minor
'@pyreon/primitives': minor
---

iOS output now states the cross-platform defaults instead of SwiftUI's own, so the same source looks the same on iOS as on the web and Android. This changes the generated Swift of every app:

- `<Stack>` / `<Inline>` without `align` emit `VStack(alignment: .leading)` / `HStack(alignment: .top)` (web flex `stretch`, Compose Start / Top). Rows no longer centre and unequal columns no longer stagger.
- `<Scroll>` puts its content in a leading-aligned stack pinned to the leading edge (a top-aligned row when horizontal).
- Routed screens (the home route, tab roots and every `navigationDestination`) are pinned top-leading instead of centred in the screen.
- `<Button>` with no variant or `primary` draws `.buttonStyle(.borderedProminent)` (a filled button, as on the web and Compose) instead of a text link; `ghost` is `.borderless` (tinted text, like Compose `TextButton`).
- `<Field>` draws `.textFieldStyle(.roundedBorder)` (text, password, the `kind` ternary and multiline).

A `<Button>` or `<Field>` whose `background` prop or `style` draws its own background or border keeps the app's look and gets no system chrome, as on the web. `<Press>` stays chrome-less. Compose output is unchanged.
