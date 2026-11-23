---
'@pyreon/calendar': patch
---

`styles.css` closes its `@media print` block again. Two closing braces were lost in a merge, so the timeline's now line and its drag selection were styled only when printing, and any stylesheet bundled after the calendar's (for example `@pyreon/command/style.css`) was nested inside it: `vite build` failed with `Unknown at rule: @keyframes`. 0.53.0 shipped with this; upgrade to get the fix.
