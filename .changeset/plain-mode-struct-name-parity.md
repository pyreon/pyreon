---
'@pyreon/native-compiler': patch
---

PMTC's per-module struct-name suffix is now derived from the PARSED module
(the IR `parsePyreon` builds), not the raw source text — fixing a struct-name
divergence between a Plain-authored module and its hand-written classic twin.

Synthesized anonymous-object structs (`__Obj0`, `__Obj1`, …) get a per-module
suffix (`__Obj0_k3x9a`) so two generated files in one Xcode target / Gradle
source set don't both declare `__Obj0`. That suffix used to hash the module's
RAW SOURCE TEXT — deliberately, to avoid the machine-dependent absolute path
the CLI passes.

Plain Mode's pre-pass (`transformPlain`) lowers `let x = state(0)` to `const x
= signal(0)` — and wraps a conditionally-read dep in a `void (…)`
total-tracking prologue — BEFORE `parsePyreon` ever builds the IR. So a
Plain-authored module and its hand-written classic twin converge to the exact
same `ParseResult` (same components, same synthesized structs) but start from
DIFFERENT raw text: different imports, `let`/`state()` vs `const`/`signal()`,
an extra `void (…)` prologue the classic twin never has. Hashing that text gave
the SAME logical module two different struct-name suffixes depending on which
dialect authored it:

```
- data class __Obj0_12aar3a(var name: String)
+ data class __Obj0_16i1zq1(var name: String)
```

This broke the "Plain and classic emit byte-identically" guarantee PMTC is
built around — a semantics-preserving Plain Mode rewrite of an existing file
renamed every one of its synthesized structs, which is exactly the kind of
diff a `pyreon plain --write` run should never produce.

The fix hashes the PARSED IR instead of the raw text: `moduleTag` now takes
the `ParseResult` and hashes a JSON snapshot of its semantically-relevant
fields (components, structs, enums, module decls, stores, models, field
metas, features, zod schemas, helper functions, styled/rocketstyle/attrs
components). `warnings` and `aliasImports` are excluded — a Plain Mode warning
message embeds the filename itself (`msg (file:line:col)`), which would
reintroduce the exact path-dependence the suffix exists to avoid, and
`aliasImports` is a `Map` that stringifies to nothing useful. `ParseResult`
never carries the filename it was parsed with, so this stays exactly as
checkout-location-independent as the source-text scheme it replaces.

`synthStructName` is only ever called from the emitters, never from
`parsePyreon`, so `transform()` now parses first and derives the suffix from
that result before emission runs — no change to when the suffix is
established relative to emission, only to what it's computed FROM.

Two structurally-different real files landing on the same tag is no worse
than under the old scheme: source-text hashing already collapsed two files
with byte-identical source onto one tag, and a module that parses to the
exact same IR as another one already shares its top-level declared names —
the two would collide on those regardless of this suffix.

Bisect-verified: reverting `moduleTag` to hash the raw source text reproduces
the failure (`native-plain-parity-fixes.test.ts` — the kotlin case for
`(void (…), expr)` fails with the struct-suffix mismatch above; the Swift
case fails identically). Full `@pyreon/native-compiler` suite — including
`multi-module-compile.test.ts` (per-module struct-suffix uniqueness across
genuinely different files, compiled together against real swiftc/kotlinc) and
the url-state suites that also rely on `moduleTag` for cross-file uniqueness —
passes unchanged.
