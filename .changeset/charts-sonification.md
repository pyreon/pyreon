---
'@pyreon/charts': minor
---

`sonifyValues(values, options)` — a series as sound: values map linearly to pitch (`minHz..maxHz`), an oscillator steps through them over `duration`, gaps play as silence, `onStep(index)` fires per datum, and a `ChartLink` moves every linked chart's crosshair along with the audio. Injectable `AudioContext`; `play()` resolves when done or on `stop()`.
