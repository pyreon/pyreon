---
'@pyreon/compiler': patch
---

`emitValidator` correctness fixes surfaced by the new cross-runtime equivalence gate (a corpus test in `@pyreon/validate` that builds each schema both as the real runtime `s` and via `analyzeValidate`→`emitValidator`, then asserts the accept/reject verdict matches for every input): the emitted `email` check now uses `@pyreon/validate`'s strict standard `EMAIL_RE` (2+ char TLD, no leading/consecutive dots) instead of a loose `^…@…\.…$`, and the `.nonEmpty()` string check is recognized under its real camelCase method name (was `nonempty`). Email/url/uuid regexes are now emitted from verbatim `RegExp` literals via `re.source`/`re.flags` so they can't drift from the runtime in transcription.
