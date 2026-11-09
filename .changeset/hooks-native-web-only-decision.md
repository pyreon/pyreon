---
"@pyreon/hooks": patch
---

Document, in the manifest, which responsive and props hooks stay web-only on native and why: `useControllableState`, `useBreakpoint` and width/orientation `useMediaQuery` are named compile warnings that drop the hook (use `useSizeClass()` / an explicit prop plus local state). No behaviour change.
