---
'@pyreon/charts': minor
---

`<OptionChart option>` — the ECharts-option-driven reactive host: pass an ECharts-shaped option (value or accessor) and get a live canvas chart with click hit-testing (`onSelect` → `{ seriesIndex, dataIndex, name, value }`), `theme` / `locale`, a driven or auto-playing `timeline` (`timelineIndex`, `onTimelineChange`), multi-`grid` composition, and the accessible table; family and geo options render through the same facade as SVG. `compiledCommands` (the composed picture of a compiled cartesian option as flat commands) is exported so `optionToSvg` and the host paint one geometry.
