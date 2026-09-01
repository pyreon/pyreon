---
'@pyreon/charts': minor
---

Scrollable legend + title block. `renderLegend` gains `maxRows` and `page`: a legend that overflows the cap shows `maxRows` rows and a right-aligned pager (prev / current-of-total / next) whose arrows come back as hit rects in `LegendLayout.pager`; the second layout pass reserves the pager's width so the last visible row never runs under it, entries on other pages are not drawn and keep an EMPTY hit rect (w = -1) so `boxes` stays index-aligned, and an uncapped legend renders byte-identically to before. New `renderTitle(text, subtitle, box, opts)` lays out a title and optional sub-title block (start/middle/end alignment) and reports the height it consumed — the legend's contract — so a host shrinks the plot by exactly what was drawn.
