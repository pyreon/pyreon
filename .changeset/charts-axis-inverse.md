---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

A reversed value axis for `@pyreon/charts`: `<Axis y inverse>` and `<Axis y2 inverse>` (or `yInverse` / `y2Inverse` on `<PlotChart>`).

The high end of the axis goes to the bottom (the left, on a horizontal chart), so a rank chart reads 1 at the top and a depth profile reads depth going down. Bars and areas hang from the top (their baseline is the axis floor, now the top), their rounded ends move to the free end, and the ticks run the other way. It composes with log and time axes, dual axes (each reverses on its own), a zoom window, the crosshair, the tooltip and the hit targets, and with `rtl` (RTL mirrors x, inverse flips y, so they commute). Only the value-to-pixel mapping flips: the data, the tooltip rows and the accessible table keep their order. `yInverse` / `y2Inverse` lower to iOS and Android as literals; reversing the x (category) axis is not supported yet and warns by name.

Internally every value-to-pixel mapping now goes through one `yPx` / `xPx` seam over `Domain.inverse`; the refactor is behaviour-neutral (every existing draw-list golden and native-golden entry is unchanged).
