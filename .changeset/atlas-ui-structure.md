---
"@pyreon/atlas": patch
---

The workbench UI restructured for readability — zero behavior change:
one styled component per file under `components/<region>/`, views in
region folders with the four built-in panels split out of the former
`builtin-panels.tsx`, and a real token system (`ThemeScale`: font
families, a named size scale, tracking, radii, motion, the hairline
border) extracted from the exact values the chrome already used.
