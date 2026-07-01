---
"@pyreon/compiler": patch
---

Fix directive-islands duplicate-`const` collision for parameterized strategies

`transformClientDirectives` deduped island wrappers by the FULL strategy string
but derived `varName` + island `name` from a fragment truncated at the first
`(` (`strategyFrag`). So two parameterized strategies that share a base word —
`media(min-width: 100px)` vs `media(min-width: 999px)`, or `interaction(click)`
vs `interaction(focus)` on one component — were kept as two distinct islands yet
emitted the IDENTICAL `const __pyIsland_M_media` twice: a hard `SyntaxError`
("already been declared") that fails the bundler, plus a duplicate island
`name` (exactly the `duplicate-name` bug the feature promises to prevent) and
both call sites silently hydrating under the wrong strategy.

Fixed by `strategyIdent`: the readable base fragment is kept for bare strategies
(`visible`/`idle`/`load`/`never` stay hash-free), and a stable FNV-1a hash of
the full strategy is appended only when the strategy is parameterized — so
distinct strategies always get distinct identifiers. Regression-locked
(bisect-verified) by two/interaction/media collision specs + a bare-strategy
hash-free spec.

Note: the transform has no consumer on `main` yet (the plugin wiring is a
separate increment), so this shipped as dead code — but the emitted output was
wrong and would have detonated the moment it was wired. A separate, niche
cross-FILE registry-name collision (two sibling dirs differing only by `-` vs
`_`) remains, and is caught by the `pyreon doctor --check-islands`
`duplicate-name` detector.
