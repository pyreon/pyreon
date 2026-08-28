---
'@pyreon/lathe': minor
---

The schema library is selectable too: `validator: 'pyreon' | 'zod'` (and
`--validator`). One walk with a different binding rather than two renderers that
can drift; both satisfy Standard Schema, so the endpoint layer accepts either
without knowing which was chosen, and `client` composes with it freely.

Every zod spelling was verified against the installed zod (4.4.3) rather than
inferred from its changelog. `z.string().email()` is deprecated there in favour
of `z.email()`, and the deprecated form is emitted deliberately: it works in zod
3 *and* 4, while the newer one exists only in 4.

**zod lowers strictly more of a real spec than the first-party validator.**
Measured against the real native compiler: a nested object and an array of
objects lower under zod (via `@pyreon/validation`'s `zodSchema(...)` wrapper) and
are dropped under `s.*`. A field naming another model is dropped by both — and
under zod that gap closes, because refs are inlined on the native path and an
inlined ref is a nested object. So a spec whose `Book` has an `author: $ref`
produces a Swift struct that keeps `author`, where the default validator emits it
without that field. A `$ref` cycle falls back to naming the target; the compiler
drops that one field and the generator stays bounded.

The matrix is pinned by a test that runs the real compiler, so a change in PMTC
corrects the claim rather than leaving it stale.

## Generated output is now typechecked for every client × validator pair

The pyreon/pyreon combination had this coverage indirectly, through the
bookshelf example. No other combination had any — the runtime tests execute
through bun, which transpiles and does not typecheck. Running the real
TypeScript compiler over all eight found five defects that were invisible
otherwise:

- **A `$ref` cycle produced schemas that did not typecheck at all** (TS7022), on
  *both* validators. `lazy(() => X)` inside `const X = …` makes inferring X from
  its own initializer circular. Pre-existing; the example has no cycles. Cyclic
  models now name the structural type first and annotate the const.
- **Every generated hook on an adapter client was typed `Promise<unknown>`.**
  The emitted `Infer` matched `{ types?: { output } }` directly, which fails
  silently against a library spelling it `types?: Types | undefined`.
- The barrel exported `mockRoutes` unconditionally — a `@pyreon/http` middleware
  with no adapter equivalent — so a non-Pyreon client emitted an `index.ts` that
  did not compile. It also never exported `installMocks`, the one function the
  mocks plugin exists to provide.
- The fetch adapter's `body` was not assignable to `RequestInit` under
  `exactOptionalPropertyTypes`.
- The cyclic annotation declared a narrower enum type than `@pyreon/validate`
  actually infers, which is the declared-type-vs-runtime-schema drift that
  generating both from one walk exists to prevent.
