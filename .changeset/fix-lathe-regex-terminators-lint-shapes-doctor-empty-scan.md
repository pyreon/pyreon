---
'@pyreon/lathe': patch
'@pyreon/lint': patch
'@pyreon/cli': patch
---

Three confirmed pre-release defects in the tools layer, each a case of a guard
that recognised one SHAPE of its class and stopped there.

**`@pyreon/lathe` — a `pattern` carrying a line terminator killed the whole
generated schemas module.** `portableRegex` refused a `pattern` containing `/`,
and its own comment says why: the emit writes `` /${pattern}/ ``, so an
unescaped `/` ends the literal. A regex literal is ALSO ended by all four
JavaScript line terminators — `RegularExpressionChar` is built from
`RegularExpressionNonTerminator`, "SourceCharacter but not LineTerminator", so
LF, CR, U+2028 and U+2029 are illegal anywhere in one, character class
included. `{"pattern": "a\nb"}` is legal OpenAPI, so this needed no bad faith
to reach, and the damage is not a dropped constraint: `.regex(/a<LF>b/)` is
`Unterminated regular expression literal '/a'`, which takes every model in
`schemas.ts` with it — one spec field is a build-time failure for the whole
generated client. All four are now refused alongside `/`. A raw CONTROL
character is NOT a terminator and stays legal, which is the discriminating case
and has its own spec, so the guard cannot quietly widen into "anything unusual".

This is the FIFTH lexical context a spec-controlled string reaches in this
package, after the line comment, the block comment, the string literal and the
JSON literal — the other four already handle line terminators
(`safeLineComment`, `q`, `jsonLiteral`), and the regex literal simply never
joined them. The `injection.test.ts` suite gains it as a fifth context and keeps
that file's discipline: the spec EXECUTES the emitted module, because
arbitrary-code injection is not reachable through a regex literal while `/`
stays refused, so "does this still parse" is the assertion that catches it and a
string-level check is not.

**`@pyreon/lint` — `no-query-selector-cast-in-test` missed three ordinary
shapes.** Measured firing ZERO times on each, against a rule configured `error`:

```ts
c?.querySelector('a')    as HTMLAnchorElement       // ChainExpression
el.querySelector('x')    as HTMLElement & { _x }    // TSIntersectionType
el.querySelectorAll('x') as NodeListOf<HTMLDivElement>
```

The third is the sharpest: the rule's own docblock advertised `queryAll` for
`querySelectorAll` while the callee test only ever accepted `querySelector`, so
the advice named a case the matcher could not see. The guard listed two AST
node types over a bare `MemberExpression` callee; the class is "a
`querySelector` / `querySelectorAll` call, HOWEVER REACHED, cast to a type that
MENTIONS an HTML element type". It now peels the wrappers that can sit between
a cast and its call (`ChainExpression`, a second `as`, `!`) and WALKS the
annotation (union, intersection, parenthesised, array, and type ARGUMENTS,
which is where `NodeListOf<…>` hides the element type), so a spelling nobody
has written yet is covered by construction. The angle-bracket cast
(`<HTMLY>expr`) is the same defect and is handled too. Eleven real sites in the
repo were reporting nothing and are now fixed with the typed helpers.

**`@pyreon/lint` — `no-require-in-esm` flagged the escape hatch it recommends,
and never looked at test files.** `const require = createRequire(import.meta.url)`
is the one legitimate way to load a CJS-only artifact (a napi `.node` addon, a
built CJS bundle) from an ES module, and the rule's shadow detection covered a
parameter and an import but not a variable binding — so `vite-plugin`'s
`plain-build.test.ts`, already correct and with a comment saying why, read as a
finding. The binding is now counted like a parameter: released when its
enclosing function exits, file-wide at module scope, so one `createRequire`
cannot mute the rule for the file.

Separately, the rule declared no `scanTarget` and therefore got the `source`
default — but a `.test.ts` in a `"type": "module"` package throws
`require is not defined` under real Node exactly as `src/` does. This repo was
carrying 47 such calls across ten test files, all green, because bun defines
`require` in ESM, which is this rule's entire premise. `RuleMeta.scanTarget`
now accepts a LIST and the rule declares `['source', 'test']`. Resolve it
through the new `scanTargetsOf` / `targetsScan` helpers rather than comparing
with `===`, which silently matches nothing against a list — the same shape of
silent hole the field exists to close.

**`@pyreon/cli` — the doctor lint gate's extra `scanTarget` passes evaporated
silently.** The PRIMARY scan already refuses to read an empty file list as a
clean pass (`emptyScanResult` skips loudly, because a gate that inspected
nothing must not score like one that inspected everything). The two
`scanTarget` passes were added beside that guard and `continue`d on an empty
match, so a pass that reached zero files left the gate green while every rule
it exists to run reported nothing — the same class as its own neighbour's
comment, one level down. An empty extra pass is now a `warning` finding that
names the rules which did not run and cannot have passed.

---

**One budget moved, and it is a gate finding rather than a size change.**
`@pyreon/lint`'s bundle budget was **512 bytes** — for a linter shipping 513 KB
of built chunks. `check-bundle-budgets` builds the main entry with
`splitting: true` and measures only the entry OUTPUT; `lib/index.js` was a pure
re-export barrel over `_chunks/`, the package declares `sideEffects: false`, and
nothing inside the bundle consumes those exports — so Bun tree-shook the entire
package away and the gate measured a **730-byte empty bundle**. It was not
measuring `@pyreon/lint` at all.

Exporting `scanTargetsOf` / `targetsScan` puts a live declaration in the entry,
which defeats the drop-everything outcome and reveals the real figure: 65,807
bytes gzipped. The budget is bumped BY HAND to 67,840 (+3.1%, above the measured
local-vs-CI gzip delta) — never `--update`, which would rewrite all 71 entries
from this machine.

**The shipped bytes did not change.** Both `_chunks/` files are byte-identical
across the change (content-addressed names unchanged: `cli-DAVSZa6Z.js` 68,485 B
and `runner-B-C7XePv.js` 440,848 B), and the built barrel is 2,214 B either way.
A consumer importing `{ lint }` gets exactly what they got before.

Two sibling packages have the same shape and are still measuring empty bundles:
`@pyreon/charts` (256 B budget, 570 KB of lib) and `@pyreon/lathe` (512 B, 170 KB).
Making the gate REFUSE a near-empty measurement is the right fix and is the same
class as the doctor change above — but it requires honest re-baselines for both,
so it is called out here as an immediate follow-up rather than folded in.
