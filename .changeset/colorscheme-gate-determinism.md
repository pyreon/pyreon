---
'@pyreon/native-compiler': patch
---

The iOS `useColorScheme` device assertion now runs BOTH appearances as two CI
legs, with the runner pinning `xcrun simctl ui <sim> appearance` instead of
inheriting whatever the image left behind.

It previously asserted only "Theme: light" under the ambient appearance, so a
`colorScheme` that was a baked constant satisfied it exactly as a live
`@Environment(\.colorScheme)` read does — the differentiating half was a manual
local step, which is to say it was not in the gate at all. It also failed on any
simulator left in dark mode, with a message accusing the emit of not reading the
environment.

No compiler behaviour changes; this makes an existing R4 claim actually
load-bearing.
