---
"@pyreon/styler": patch
---

`normalizeCSS` builds its output by copying verbatim runs (`css.slice`) instead
of appending one character at a time.

The single-pass scanner classified characters with `charCodeAt` (correct — the
discipline the sibling scanners in this file already follow), but built its
result with per-char `out += css[i]` — the exact allocation anti-pattern those
scanners' own comments warn against (a fresh 1-char string per iteration, and a
rope the downstream `hash()` / insertCache must flatten). This finishes that
discipline: runs are copied with `slice`, and when nothing is skipped or inserted
the input string is returned by identity (no allocation).

Behavior is BYTE-IDENTICAL — proven by a differential fuzz test that asserts the
new implementation matches a pinned copy of the original on hand-picked edge
cases (comments, `://` in URLs, redundant semicolons, whitespace collapse,
leading/trailing) plus 20,000 random inputs.

Perf: an A/B on the CSS-in-JS cold-insert bench is CI95-disjoint faster
(~1.3×), though the machine was under elevated load when measured, so treat the
exact ratio as directional. Note the honest scope: cold insert runs once per
unique rule per sheet lifetime (≈zero in the no-reset production SSG shape), so
this is primarily a code-hygiene fix + a bench-headline improvement, not a
user-perceivable speedup. Warm dedup / dynamic resolve / SSR collect were
measured at their architectural floor and are unchanged.
