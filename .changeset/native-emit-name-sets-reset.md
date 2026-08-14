---
'@pyreon/native-compiler': patch
---

Reset the emitters' hook-binding-name sets per file

Both emitters keep module-level `Set`s of hook binding names (`_motionSwift`,
`_speechKotlin` and seven siblings each) so a read like `m.active()` knows to
drop its parens. A pre-pass fills them by walking every component at once, so
they are file-scoped — but nothing ever reset them, and they grew for the life
of the process.

That is a leak Class C, and it is what took `audit-leak-classes` from 44
findings to 51 against its ceiling of 40. Clearing them at each emitter's
entry brings the audit to 37.

This is hygiene, not a bug fix: no input was found where the stale names
changed the emitted output.
