---
'@pyreon/kinetic': patch
---

fix(kinetic): Stagger + Group children render correctly when the Pyreon compiler wraps the JSX child in a deferred accessor

**Reported symptom**: `kinetic('div').stagger()` (and `.group()`) with multiple component-VNode children rendered `<undefined>` HTML tags in place of the real children post-hydration. SSR HTML was correct (`<h1>Hello</h1>` + tagline + icons with `--stagger-index` styles inlined) but client hydration replaced the entire subtree with literal `<undefined></undefined>` elements + `<!--pyreon-->` markers. Reproduced on `examples/bokisch.com`'s Intro section: `kinetic('div').preset(blurInUp).stagger({ interval: 80 })` + `show={() => true}` + `appear` + three rocketstyle-wrapped children → SSG'd HTML carried the children, post-hydrate every child was `<undefined>` (puppeteer-verified, `h1Count: 0`, body text missing "Hello", "I build…", icon labels).

**Root cause** (compiler + library cooperation):

1. The Pyreon vite-plugin compiler's prop-inlining pass rewrites `<Comp>{children}</Comp>` where `children` is a local `const` derived from a getter-shaped binding (`const children = childHolder.children` after `splitProps`) as `Comp({ ..., children: () => childHolder.children })`. The receiving component therefore sees `props.children` as a FUNCTION, not the expected `VNode | VNode[]`. DOM-consuming code routes through `mountChild` which handles function children correctly (as reactive accessors via `mountReactive`), so this wrap is invisible to most consumers.

2. **StaggerRenderer** iterated children directly at the VNode level (to build per-child `TransitionItem` wrappers): `(Array.isArray(children) ? children : [children]).filter(isVNode)`. When `children` was a function, this produced `[function].filter(isVNode) === []` → the rendered `<div>` had ZERO children → SSR-rendered content was replaced by an empty `<div>` during client mount.

3. **TransitionItem** then ALSO hit the wrap one level down: StaggerRenderer's `<TransitionItem>{cloneVNode(child, {style})}</TransitionItem>` JSX child likewise compiles to `() => cloneVNode(child, {style})`. `TransitionItem`'s `cloneVNode(props.children, {ref})` spread a function (no own enumerable properties) → produced `{type: undefined, props: {ref}}` → `mountElement(undefined)` → `document.createElement(undefined)` → literal `<undefined>` HTML tag.

**Fix**: new `resolveChildren` helper in `utils.ts` — unwraps a children value that may be a compiler-emitted accessor. Applied at both fix-sites:

- `StaggerRenderer` calls `resolveChildren(children)` before the iteration. Group works around the same shape independently via its existing `typeof children === 'function'` normalize.
- `TransitionItem` calls `resolveChildren(props.children)` once at body entry, then all downstream `cloneVNode` / `child?.props?.ref` / `child?.props?.style` reads use the resolved value.

Eager unwrap is safe for kinetic because the renderers snapshot children at render time (animation state is per-item, built once); they do NOT observe children changes after initial render. No reactivity is lost.

**Bisect-verified**: regression test at `packages/ui-system/kinetic/src/__tests__/stagger-component-children-hydration.test.tsx` covers both fix-sites independently. Reverting `resolveChildren` in `StaggerRenderer` fails the first spec (kinetic `<div>` empty); reverting in `TransitionItem` fails the second spec (`<undefined>` tag where `<h1>` should be); restoring both → all 3 specs pass + all 215 pre-existing kinetic tests pass. Real-app verified end-to-end against the bokisch.com Intro reproducer: pre-fix puppeteer showed `h1Count: 0` + 36 `<!--pyreon-->` markers; post-fix `h1Count: 1`, `<h1 class="..." style="--stagger-index: 0px; --stagger-interval: 80ms; transition-delay: 0ms;">Hello</h1>` byte-for-byte matches the SSG HTML.

**Follow-up (out of scope for this fix)**: the COMPILER auto-wrapping `{children}` JSX child expressions in `() => x.children` for component (not DOM-element) parents is the deeper root cause. The current wrap is correct for DOM-element parents (where children are reactive text/child slots) but mismatched for component parents that snapshot children. A future compiler pass could refrain from wrapping when the parent is a function component — but that needs a careful audit because consumers like `mountChild` already handle the function form via `mountReactive`. The library-side fix in this PR is the defensive, immediate unblock.
