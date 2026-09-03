---
'@pyreon/runtime-dom': patch
'@pyreon/compiler': patch
---

Hydration now ADOPTS the SSR text node behind a mixed-content interpolation,
instead of rendering its value twice.

An element whose last child is an interpolation, with any sibling before it,
rendered the value TWICE and left a stray close marker:

```
SSR       <div class="b">Count: <!--$-->7<!--/$--></div>
hydrated  <div class="b">Count: 77<!--/$--></div>
```

`<p>Hello {name}</p>`, `<div>Count: {n()}</div>`, `<p><b>B</b>{tail()}</p>` —
among the commonest shapes a rendered page contains.

The compiler bakes a `<!>` placeholder for such a slot and used to inline
`createTextNode("") + replaceChild` against it. That is right for a CLONE and
wrong for an ADOPTED container, where the placeholder ref resolves to the live
`<!--$-->` opening the range that already holds this slot's server-rendered
text. The bind wrote the value into its fresh node while the server's own text
survived beside it.

`_mountSlot` has been marker-aware for ELEMENT slots since the compiled path
became a consumer of the SSR range. The text slot never joined that agreement,
because its swap is INLINE generated code the runtime cannot intercept — so the
fix is a new runtime helper, `_textSlot`, carrying the same
clone-vs-marked-range discrimination, which both compiler backends now emit in
place of the inlined pair.

**This supersedes #3299**, which fixed the same defect by REFUSING the shape in
the verifier so the element rebuilt. That was correct and deliberately minimal —
a correctness fix should not wait on a compiler change — but it paid for
correctness with adoption. This keeps both: the affected elements render once
AND stay adopted, node identity intact.

Measured on the shapes above, SSR then hydrate, counting node identity:

| shape | before | #3299 | now |
| --- | --- | --- | --- |
| `<p>Hello {n()}</p>` | 3/3 adopted, WRONG output | correct, rebuilt | **3/3 adopted, correct** |
| `<p><b>B</b>{t()}</p>` | 4/4 adopted, WRONG output | correct, rebuilt | **4/4 adopted, correct** |

Adoption is not a nicety here: a rebuilt node loses typed input, focus, scroll
position and any listener attached by non-Pyreon code, so this is a correctness
metric before it is a speed one.

An empty range (`<!--$--><!--/$-->`, the accessor rendered `''`) and any range
holding content a polymorphic binding will replace are handled explicitly —
cleared depth-counted so a nested range cannot end the walk early, then given a
fresh node. Correct, simply not adopted.

Two gaps let the original defect ship. The hydration parity fuzzer builds its
trees with `h()` and never `transformJSX`, so it reaches the runtime path only
and structurally cannot see a compiled-template defect — a gap its own record
already names as owed. And a real `@pyreon/zero` page re-mounts most of its body
rather than adopting it, so the broken branch rarely ran where it would be
noticed. The new specs compile through the REAL transform for that reason, and
assert node identity and the `runtime.tpl.adopt` counter alongside the HTML — an
output-only suite would pass for a fix that gave up adoption.

Bisect-verified in both halves. Neutering `_textSlot`'s marked-range branch
fails five specs with `Hello AdaAda` / `Count: 77` / `tailtail` / `v=11`;
reverting the JS emit with the native binary moved aside (so the JS backend is
actually exercised) fails the same five. Both backends emit `_textSlot`
byte-identically, locked by the compiler's native-equivalence suite.

Three compiler specs asserting the old emit were updated rather than deleted:
each protects an invariant this change preserves — mixed content still uses a
comment placeholder rather than a baked space that would merge during parsing,
and PZ-08's slot target is still the phase-1 hoisted const, never a walk
re-evaluated after `_mountSlot` mutated the sibling list.
