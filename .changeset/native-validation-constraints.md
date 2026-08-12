---
'@pyreon/native-compiler': patch
'@pyreon/validation': patch
---

Native schema validation accepted data the web rejects

Two constraints resolved differently on device, both in the ACCEPTING
direction — the wrong way for a validator to be wrong.

**`.regex()` was silently dropped.** The constraint walker recognised
min/max/email/url/uuid and had no `regex` arm, so the modifier fell through
its `else if` chain: the field emitted with only a type guard, no check and
no diagnostic. A schema that rejects `"Not A Slug!"` on the web accepted it
on device.

**`.url()` parsed instead of validating.** `URL(string:)` and
`java.net.URI(...)` are permissive parsers; measured against zod, four of six
cases diverged and every one of them accepted something the web denies —
`"not a url"`, `"x.com"` and `"/relative"` all passed. Requiring a scheme
reproduces zod's rule (an absolute URL) while still accepting `mailto:` and
`ftp://` as zod does. All six now agree.

The regex arm is deliberately conservative. JS, NSRegularExpression and
java.util.regex agree on the common syntax — anchors, classes, quantifiers,
groups, alternation — and diverge on the rest, so a pattern carrying a
non-portable flag (anything but `i`), lookbehind, a named group or a Unicode
property escape declines BY NAME. A declined field is no worse off than it
was; it is just no longer silent. Both targets test for a partial match,
which is what `RegExp.test()` does on the web.

**The diagnostic contradicted the emit.** `zodSchema` warned "has NO native
lowering … the native build fails with `cannot find 'zodSchema' in scope`",
printed directly above the native struct it was denying, with advice sending
the author to a `<Web>` escape hatch for code that works. A top-level
`zodSchema(...)` / `valibotSchema(...)` / `arktypeSchema(...)` declaration
now suppresses it, decided in the same syntactic pre-scan `@pyreon/validate`
already uses because the warn pass runs before schemas are recognised. An
import with no such declaration still warns.

Measured against zod rather than mirrored between the two targets: the web
arm is `@pyreon/validation`'s `native-parity.test.ts`, and the emitted
Swift and Kotlin both compile on the real toolchains.
