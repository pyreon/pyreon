---
'@pyreon/compiler': patch
---

Fix a family of fuzz-found signal auto-call + static-attribute bugs — several runtime-broken on the shipped (native-first) backend:

- **`onClick={() => count.set(count + 1)}` — the canonical counter — was broken on the native backend**: auto-call never descended into handler bodies, so the emitted code added the signal *function* (`count.set(count + 1)` → `"() => {…}1"`). Both backends now walk nested function bodies (shadow-aware) uniformly.
- **Signals inside `.map`/callback re-emits were never auto-called in either backend** — `title={sig ? "a" : "b"}` inside a `.map` was stuck forever (a bare signal function is always truthy).
- **Nested JSX inside conditional slots stringified signal source on native** — `{cond() ? <span id={`v${sig}`}> : null}` rendered `id="v(...args) => {…"`. The native rewriter now descends into nested JSX like the JS backend.
- **Exactly-bare signal attrs/children in re-emitted JSX now stay bare in both backends** (fine-grained runtime accessor binding — the attr updates without remounting the branch). Previously the JS backend value-called them, subscribing the whole slot and remounting the branch on every change.
- **Static attributes are never silently dropped**: the native backend's static-attr catch-all dropped `tabIndex={-1}`, `title={1+2}`, and `id={("x")}` from the DOM entirely; the JS backend dropped no-substitution template attrs (`` id={`x`} ``). Both now unwrap parens/TS layers and bake literal / no-subst-template / signed-numeric shapes; anything else static-but-computed pays a one-time runtime `setAttribute`. `hidden={undefined}` is now omitted (it used to render the string `"undefined"`, which is truthy for boolean attrs).
- **Duplicate JSX attributes now dedupe last-wins** in the template path (baking both handed the decision to the HTML parser, which is first-wins — the opposite of JSX object semantics) and emit a new `duplicate-jsx-attr` compiler warning.

Backed by a new permanent seeded differential-fuzz gate (300 seeds × client/SSR, byte-equivalence JS ≡ Rust), a curated R21 equivalence corpus, and runtime regression locks (compile → mount → signal flip → DOM assert). Campaign result: 10,000 seeds × 2 modes, zero divergence, zero throws, zero invalid output.
