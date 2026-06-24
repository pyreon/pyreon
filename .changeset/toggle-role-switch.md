---
"@pyreon/primitives": minor
---

The web `<Toggle>` now renders `<input type="checkbox" role="switch">` instead of a bare checkbox. It keeps the checkbox's universal keyboard + form behavior (Space toggles, `checked` drives `aria-checked`) but assistive tech now announces it as an on/off **switch** — matching the iOS `Toggle` / Android `Switch` it lowers to on native targets, so the same `<Toggle>` is announced consistently on every platform. The W3C Switch pattern explicitly endorses `input[type=checkbox][role=switch]`. No interaction or API change; web-only (the native PMTC emit is unaffected).
