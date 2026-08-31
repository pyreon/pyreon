---
'@pyreon/charts': minor
---

Horizontal bars: `<PlotChart horizontal>` puts categories on the Y axis with
the left gutter sized by the widest category label (long names are the reason
horizontal bars exist), grows bars rightward from the zero line — negative
values leftward, the entrance animation included — and keeps the value
formatter on the X axis. Bar marks only; non-bar marks are skipped rather
than drawn as a misleading transpose. `chartToSvg` takes the same option.
