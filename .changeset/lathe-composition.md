---
'@pyreon/lathe': minor
---

Composable output: layered entry points, a `sideEffects` marker, and two new plugins.

**The output is a layered graph rather than one barrel.** `index.ts` carries the
production surface; `dev.ts` carries fixtures, faker factories and preview
components; `endpoints/index.ts` and `queries/index.ts` are one layer each. A
barrel is a reachability edge, and a fixture table is DATA — so unlike an unused
function it survives minification wherever it is reachable, and the flat barrel
put every fixture in the page bundle.

**An emitted `gen/package.json` declares the output side-effect-free**, which is
what actually makes it tree-shake. A bundler keeps a module-level call unless it
can prove the call is pure, and `api.endpoint(...)` and `s.object({ ... })` are
both module-level calls. Measured with Vite 8 on a 30-tag / 120-operation spec,
importing one hook: **30,710 B → 5,748 B** (2,420 → 642 gz), 120 fixtures → 0,
and the barrel now costs exactly what a per-tag import costs. The declaration is
an ARRAY naming `atlas.wrapper.tsx` whenever `atlas` is selected, because that
file really does call `installMocks()` at module scope and a blanket `false`
would be a lie a bundler would act on. `/* @__PURE__ */` per declaration was
measured first and is nearly useless here (2,041 → 2,000 B, 2%): the arguments
are themselves calls the bundler must still evaluate.

Note the honest limit: an app whose own `package.json` already declared
`sideEffects: false` was never affected — its declaration covered the generated
files too. The marker means the result no longer depends on a field in a file
the generator did not write.

**`plugins: ['faker']`** emits one `createX(overrides?)` factory per model.
Constraints outrank realism: `min`/`max`/`pattern`/`enum` choose the generator
and the field-name guess only applies where the spec states nothing, so a
factory produces data its own schema accepts. Recursive models terminate —
depth is threaded through the builders rather than kept in module state.

**`plugins: ['docs']`** renders Markdown reference pages with frontmatter, so
they drop into a `@pyreon/zero-content` collection and still read on GitHub.
They document the GENERATED client — the hook's name, its import site, and the
one column a rendering of the spec cannot produce: whether the operation reaches
iOS and Android, and when it does not, why. That comes from the same analysis
the CLI prints, so page and terminal cannot disagree.

**Breaking:** `index.ts` no longer re-exports `installMocks`, `mockRoutes`,
`mockRouteTable` or the preview components. Import them from `./gen/dev`.
