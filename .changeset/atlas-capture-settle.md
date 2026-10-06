---
'@pyreon/atlas': patch
---

`atlas verify-browser` now captures a scenario only once its preview holds still. A finite JavaScript canvas `requestAnimationFrame` animation was screenshotted one frame after the click-walk — mid-flight — because `animations: 'disabled'` does not stop it; the runner now waits until DOM, element geometry and canvas pixels are unchanged for `--settle-ms` (default 300; at most 100 for a preview with no canvas/video/image) bounded by `--settle-timeout` (default 5000). A preview that never settles (an endless loop) is not screenshotted and records no baseline: its snapshot check fails with a new `capture-unsettled` finding and the run exits non-zero. Fixes #3837.
