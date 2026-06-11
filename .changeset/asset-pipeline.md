---
'@pyreon/primitives': minor
'@pyreon/create-multiplatform': patch
---

Image asset pipeline (multiplatform production Phase 1): the web `<Image>` primitive now resolves BARE src names (`logo.png` — no scheme, no slash) to `/assets/<name>` so the same shared source that bundles via Assets.xcassets (iOS) / res/drawable density buckets (Android) serves the materialized copy on web. The `create-multiplatform` scaffold's build scripts run the new `pyreon-native assets` step automatically when an `assets/` directory exists.
