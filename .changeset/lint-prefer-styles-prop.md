---
'@pyreon/lint': minor
---

New rule `pyreon/prefer-styles-prop` (styling, `warn`, on in `recommended`; auto-gated on `@pyreon/elements`). It flags the `css` escape hatch on a component (`<Card css={…}>` and `h(Card, { css: … })`) and names the typed `styles` override, which takes the same object shape as `.theme()`. It skips HTML elements, components imported from `@pyreon/coolgrid` (which have no typed override) and the slot `*Css` props. Keep a deliberate `css` (a selector or an at-rule) with `// pyreon-lint-ignore pyreon/prefer-styles-prop` and the reason. The registry is now 142 rules.
