---
"@pyreon/charts": minor
---

Series labels are a first-class engine module: `label.formatter` takes ECharts' `{a}` (series name), `{b}` (category), `{c}` (value) and `{d}` (share of the series total) as well as a function; `label.color` and `label.fontSize` style the label; `\n` breaks a line; and `label.rich` names the styles a `{name|text}` segment can take, laid out about the same anchor a one-line label uses. A plain label still emits exactly one text command, so nothing changes for the common case. What a rich style changes beyond a colour and a size is named rather than ignored.
