---
'@pyreon/hooks': minor
---

Add `useSizeClass()` — the horizontal size-class read as `'compact' | 'regular'`, the cross-platform analog of SwiftUI's `horizontalSizeClass` and Android's width-based `WindowSizeClass`. `'regular'` is an expanded (tablet / landscape / split-view) width; `'compact'` is a phone-width column.

On the web it tracks a `(min-width: 600px)` media query and updates reactively on resize / rotation. The PMTC native compiler lowers it to a pure environment read with **no runtime port** (same shape as `useColorScheme`): iOS `@Environment(\.horizontalSizeClass)`, Android `LocalConfiguration.current.screenWidthDp >= 600`.

This is the M2.2 adaptive/tablet-layout foundation — the size-class READ; the size-class-driven layout primitive (Stack↔Inline) is a follow-up. R4 is behavioral and differentiating: the counter's iOS XCUITest asserts `Size: compact` on an iPhone Simulator, and the same suite asserts `Size: regular` on an iPad Simulator, proving the read reflects the real device environment.
