---
"@pyreon/lint": minor
"@pyreon/mcp": patch
---

feat(lint): `pyreon/color-contrast` rule — flag low-contrast literal-hex pairs (a11y)

New opt-in frontend accessibility rule. When a style object literal sets BOTH
`color` and `background`/`backgroundColor` to LITERAL hex colours, it computes
the WCAG 2.1 relative-luminance contrast ratio and warns when it's below AA
(4.5:1 for normal text). Catches the exact bokisch.com Lighthouse pairs
(`#6b7280` on `#212121` = 3.33:1, `#f8f8f8` on `#06b6d4` = 2.28:1).

**Scope — literal hex pairs only.** It does NOT resolve theme tokens
(`color: t.color.muted`), CSS template strings, `rgb()`/`hsl()`/named colours,
or alpha hex. Theme-token contrast (the more common real-world shape) is
impossible for a static AST walker — it would need to evaluate the theme object
at its definition site. That belongs in a theme-loading audit, not a syntactic
lint rule; this covers the hardcoded-hex case it can prove with zero guessing.
Documented prominently in the rule's JSDoc.

Off in `recommended`/`strict`/`app`/`lib`; on in `best-practices`. (87 rules
total; frontend category 7 → 8.) `@pyreon/mcp` api-reference regenerated.
