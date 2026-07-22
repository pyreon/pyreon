---
'@pyreon/code': patch
---

Runtime wrapper bench vs @uiw/react-codemirror (`bench:runtime`, real Chromium): controlled-value keystroke round-trip (deterministic count: 1 owner render vs ~110 React commits for 110 keystrokes), external write → DOM (~0.4ms vs ~84ms quiet / ~530ms inside @uiw's typing latch), mount, dispose — honest-limits disclosed (same engine, wrapper-only claim, uncontrolled mode exempt). No runtime changes.
