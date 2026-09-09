---
'@pyreon/compiler': minor
'@pyreon/lint': patch
'@pyreon/router': patch
---

Detector findings can be suppressed inline, with the comment `@pyreon/lint` already uses

`detectPyreonPatterns` / `detectReactPatterns` are pattern matchers without a
type checker, so a small number of their findings are correct code the pattern
cannot tell apart. `@pyreon/router`'s `RouterView` is the standing example: it
ends on `child as unknown as VNodeChild`, where `child` is `VNodeChild | null`
— a union no `h()` overload accepts in rest position, so removing the cast is a
TS2769. A comment beside it had argued exactly that since the detector shipped,
and the finding was reported on every `pyreon doctor` and MCP `validate` run
regardless.

A detector with no local escape hatch leaves two options and both are bad: carry
a permanent false positive, or change correct code to quiet a tool. So a
`// pyreon-lint-ignore <code>` on the line above now silences one — the SAME
convention `@pyreon/lint` has always used, rather than a second one, so a reader
does not need to know which matcher produced a finding. Both the bare code and
the prefixed id the doctor prints (`pyreon-patterns/as-unknown-as-vnodechild`)
are accepted; a different code, a typo, or a comment two lines up do not
suppress.
