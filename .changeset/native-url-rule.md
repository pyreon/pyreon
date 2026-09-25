---
'@pyreon/native-compiler': patch
'@pyreon/lathe': patch
---

`@pyreon/native-compiler`: `.url()` lowers to the AUTHORING library's rule. `@pyreon/validate`'s `s.string().url()` is http(s)-only on the web, but PMTC lowered it (and zod's) to "any scheme", so a device accepted `javascript:alert(1)` where the browser rejects it; `.url({ protocol })` lowered with the option ignored. The rule now travels in the IR: zod keeps any-scheme, `s` lowers to its exact `URL_RE`, and `protocol` lowers to an RFC 3986 URI check plus the scheme pattern. The patterns are written for ICU and java.util.regex where they differ from JS (`\s`, `.`, `$` before a trailing newline, case folding), and web↔native verdicts are asserted by executing the emitted Swift and Kotlin. A `protocol` that is not an inline portable regex literal declines with a named warning.

`@pyreon/lathe`: `format: uri` emits the same `.url({ protocol })` in native modules as on the web, so a device no longer rejects the `git:` / `mailto:` URIs the web accepts.
