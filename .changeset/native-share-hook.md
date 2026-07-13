---
'@pyreon/hooks': minor
---

Add `useShare()` — invoke the platform share sheet (`text` / `url` / `textUrl` / `canShare`). On the web it uses the Web Share API (`navigator.share`); the PMTC native compiler lowers it to `PyreonShare` on iOS (`UIActivityViewController` presented from the key window) and Android (`Intent.createChooser(ACTION_SEND)`). Android shares URLs as text (its basic share intent is text-based) — a documented platform difference from iOS's typed URL items.

The second imperative platform-API hook in the multiplatform (M3) track, reusing the recognition → emit → runtime pipeline from `useHaptics`. Unlike haptics, sharing is OBSERVABLE — the counter example's iOS XCUITest asserts the system share sheet appears when the Share button is tapped (a behavioral R4).
