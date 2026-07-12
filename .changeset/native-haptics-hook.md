---
'@pyreon/hooks': minor
---

Add `useHaptics()` — a fire-and-forget haptic-feedback hook (`impact` / `notification` / `selection`). On the web it maps to `navigator.vibrate`; the PMTC native compiler lowers it to `PyreonHaptics` on iOS (UIImpactFeedbackGenerator / UINotificationFeedbackGenerator / UISelectionFeedbackGenerator) and Android (Compose `LocalHapticFeedback`). Web and Android are coarser than iOS — a documented platform difference.

This is the first imperative platform-API hook in the multiplatform (M3) track, establishing the recognition → emit → runtime pipeline the remaining platform hooks reuse. Device-proven on an iOS Simulator (the counter's increment tap fires `impact("light")` without crashing) and the Android device gate.
