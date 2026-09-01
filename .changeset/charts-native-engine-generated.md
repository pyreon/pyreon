---
"@pyreon/native-runtime-swift": minor
"@pyreon/native-runtime-kotlin": minor
"@pyreon/native-compiler": minor
---

The chart engine crosses to native as GENERATED runtime source: `gen-chart-engine.ts` compiles the ten `@pyreon/charts` engine modules through the real PMTC transform (zero warnings is a hard precondition — a warning is a silently-gutted function) into committed `PyreonChartEngine.swift` / `PyreonChartEngine.kt`, with the draw-list types renamed to the canvas-owned `PyreonChartPt`/`PyreonChartRect`/`PyreonDrawCmd`. The Swift emit is publicized (explicit public memberwise inits — SPM module boundary), and `PyreonDrawCmd` gains a full defaulted-parameter init in the synthesized field order so the emitted named-subset constructions compile. Drift-locked: `native-chart-engine-generated.test.ts` regenerates, asserts byte-equality, and compiles both targets against the verbatim canvas types.
