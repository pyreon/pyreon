---
'@pyreon/core': patch
---

`<Defer>` inline form now typechecks at source level. Closes the verify-modes gap left by PR #587.

## Two changes

**1. Widened prop types so inline form typechecks.** Before this PR, `<Defer when={x}><Modal /></Defer>` would fail TypeScript with `Type 'VNode' is not assignable to type '(Component: ComponentFn<P>) => VNodeChild'`. The `children` prop was typed only as the render-prop form, but the compiler-driven inline form passes raw JSX. TS checks the source BEFORE the compiler pass runs, so both shapes need to typecheck:

- `children?: ((Component) => VNodeChild) | VNodeChild` (was: render-prop only)
- `chunk?: () => Promise<...>` (was: required) — inline form has no `chunk` at source level; compiler synthesizes it

**2. Dev-mode error when chunk is missing at runtime.** Since `chunk` is now optional at type level, the runtime guards against the case where the inline form reaches runtime without the compiler pass having run (e.g. user runs tests through a bundler that doesn't include `@pyreon/vite-plugin`). Throws a clear actionable error pointing at both shapes.

## Also adds the verify-modes assertion that should have shipped with PR #587

Adds an inline-Defer regression gate to the `playground × spa` verify-modes cell:

- New fixture component `examples/playground/src/components/DeferredFixture.tsx` with a unique fingerprint string
- `examples/playground/src/pages/About.tsx` uses `<Defer when={open}><DeferredFixture /></Defer>`
- New `assertStringInExactlyOneChunk(dist, fingerprint, expectedPrefix)` helper in `scripts/verify-modes.ts`
- Cell asserts:
  - The fingerprint appears in EXACTLY ONE chunk
  - That chunk's basename starts with `DeferredFixture-` (proving Rolldown grouped it by the deferred component's own name, not under a shared route chunk)

**Bisect-verified**: with the `transformDeferInline` call disabled in the vite-plugin's `transform()` hook, the fingerprint lands in `about-*.js` (the route chunk pulls in DeferredFixture via the un-removed static import) and the cell fails with `expected basename to start with "DeferredFixture-". Got: about-*.js`.

## Honest disclosure of gaps still NOT addressed

- **Props on inline child** — `<Defer when={x}><Modal title="hi" /></Defer>` still bails to explicit form
- **Closure capture** — `<Modal count={count} />` where count is a local signal still bails
- **Renamed imports** — `{ Modal as M }` still bails
- **Namespace imports** — `import * as M from './X'` still bails

These remain known constraints for v1; future PRs can relax each one.
