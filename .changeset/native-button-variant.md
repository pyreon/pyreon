---
'@pyreon/native-compiler': minor
---

`<Button variant>` lowers to iOS + Android

The prop was documented (`primary | secondary | ghost | danger`, default
primary) and inert on both native targets, so a `danger` button rendered
identically to a confirm button — the case where the visual difference IS the
safeguard.

- **SwiftUI** — `.buttonStyle(.bordered)` / `.plain` /
  `.borderedProminent` + `.tint(.red)`.
- **Compose** — the role selects the COMPOSABLE (`OutlinedButton` /
  `TextButton`) rather than a modifier; `danger` keeps `Button` and overrides
  its container colour via `ButtonDefaults.buttonColors(backgroundColor = …)`.

Material **2** spellings throughout (`backgroundColor`,
`MaterialTheme.colors`) — the emit's base is `androidx.compose.material.*`,
and the Material 3 names are the trap that already shipped once with
`<Heading>` typography. Pinned by a spec.

`primary` and an absent variant are byte-identical to the previous output. A
dynamic or unknown value warns and falls back rather than guessing.
