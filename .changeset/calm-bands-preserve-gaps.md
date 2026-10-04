---
"@pyreon/charts": patch
"@pyreon/native-runtime-swift": patch
"@pyreon/native-runtime-kotlin": patch
---

Keep band regions paired across missing bounds on canvas, SVG and native. Resolve both band boundaries once per frame to avoid repeated full-channel scans, and preserve infinite-value gaps during keyed updates of transformed marks.
