---
'@pyreon/compiler': minor
'@pyreon/cli': patch
---

New `detectPyreonPatterns` code `css-prop-on-component` (24 codes): `css` passed to a component in JSX. The message and the suggestion point at a named `.multiple()` modifier applied by name (`multiple="look"`). Not fixable. Components imported from `@pyreon/coolgrid` are skipped. `pyreon doctor` leaves the code to the lint gate (`pyreon/prefer-style-modifier`, `pyreon/no-raw-css-string`), which only runs in a project that declares `@pyreon/elements`, so an Emotion `css` prop is not reported.
