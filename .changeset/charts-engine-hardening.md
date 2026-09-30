---
'@pyreon/charts': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Chart engine hardening:

- Small values no longer print as `0`: `plain` keeps about three significant digits below 0.01 and switches to exponent notation outside 1e-4…1e15, and tick labels carry the precision their step needs. A chart of 0.00012-scale data used to label every tick and tooltip `0`.
- Numeric strings (`"42"`, the usual shape of CSV or form data) are coerced with a one-time dev warning instead of silently plotting as gaps, and an unknown mark kind warns.
- Month, quarter and year time-axis ticks sit on calendar boundaries in UTC; they used to drift from a fixed-length step counted from the epoch.
- `maxPoints` below 3 and a log axis over values ≤ 0 warn.
- The canvas backing store is no longer reallocated on every draw when its size is unchanged, and a devicePixelRatio change redraws at the new density.
