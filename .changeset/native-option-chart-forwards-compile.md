---
'@pyreon/native-compiler': minor
'@pyreon/charts': patch
---

A literal `<OptionChart>` cartesian option now crosses to iOS and Android as the web facade compiled it. The spec fields ride the lowered chart: ECharts' default grid and its label containment, the axis label, line, tick and split-line rules, `onZero`, and the value-axis tick settings. So do the series fields: smoothing, `connectNulls`, area fills, label placement and the default symbols. The two targets read one interpretation of the option instead of two that drift. When the facade reads a key, the native lowering stops warning about it; an `axisLabel.formatter` (which cannot run at compile time) is still named.

Fixed on the way:
- A native option series with a `null` datum now draws the gap instead of dropping the whole chart.
- A negative number (`-2`) no longer makes an option read as non-literal.
- A cartesian column with an integral first value and a fractional later one (`data: [1, 2.5]`) now compiles. Its rows had split into two struct types.
