---
'@pyreon/zero': minor
---

`zero({ routeRules })` — central per-path render-mode overrides (Nuxt's routeRules idiom, scoped v1: `renderMode`). Glob keys (`*` = one segment, `**` = any depth, most-specific wins) map to modes for every route that doesn't declare its own — precedence: route-file `export const renderMode` > `routeRules` > app `mode`. Applied uniformly across runtime dispatch, build-time route filtering, the mode table (rule-sourced modes are marked), the SSG completeness warning (a rule declaring a dynamic route non-static is as intentional as a file declaration), and the impossible-combo build errors (which now name the offending rule).
