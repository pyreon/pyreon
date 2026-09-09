---
'@pyreon/core': patch
'@pyreon/compiler': patch
---

fix(core,compiler): the URL guard is bypassable by an obfuscated scheme on every path

`UNSAFE_URL_RE = /^\s*(?:javascript|data):/i` tolerates LEADING whitespace only.
The URL parser additionally strips ASCII tab and newline from ANYWHERE in the
input, and trims leading C0-or-space, before it resolves a scheme. So all of
these are live script URLs that the guard read as safe:

```
java<TAB>script:alert(1)
java<LF>script:alert(1)
<0x01>javascript:alert(1)
```

This defeats the guard for EVERY URL-bearing attribute at once, on all four
render paths plus the `innerHTML` sanitizer, because each one routes through
`isUnsafeUrl`.

The repo already knew this in two places and neither was the guard:
`@pyreon/router`'s `redirect.ts` implements both WHATWG steps, and
`@pyreon/lint`'s `no-script-url` strips exactly this range with a comment
naming `java\tscript:` as the bypass. So the STATIC rule, which only ever sees
literals a developer typed, was strictly stronger than the RUNTIME guard, which
sees attacker-controlled values.

`isUnsafeUrl` now tests the normalized string as well as the raw one, and both
compiler mirrors (`jsx.ts` and `native/src/lib.rs`) do the same for the
static-literal bake decision — reachable there because `@pyreon/lathe` generates
JSX from OpenAPI specs. Only the DECISION is normalized; the emitted value is
untouched. The `charCodeAt(0)` fast path is unchanged and stays sound:
normalization only removes characters <= 32, so a printable non-`j`/`d` first
character is still first afterwards.
