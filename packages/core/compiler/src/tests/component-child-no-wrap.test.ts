/**
 * Compiler contract — JSX child of a COMPONENT parent: which stable
 * references wrap in an accessor, and which are emitted bare.
 *
 * ## History (two eras, one file)
 *
 * ERA 1 (PR #732, the kinetic/bokisch fix): ALL stable references were
 * emitted bare, because wrapping `{children}` as `() => h.children` broke
 * libraries that iterate children at the VNode level (kinetic's
 * StaggerRenderer / TransitionItem `cloneVNode`) — the function spread
 * produced `{type: undefined}` → literal `<undefined>` DOM tags. PR #731
 * shipped the library-side `resolveChildren` convention; #732 added the
 * blanket compiler carve-out as belt-and-braces.
 *
 * ERA 2 (issue #2348, this contract): the blanket carve-out was itself a
 * correctness bug for PROPS-BACKED reads. `<Heading>{props.title}</Heading>`
 * emitted bare fires the compiler-emitted `_rp` GETTER once at jsx() time —
 * the child is FROZEN — while the IDENTICAL expression as a component attr
 * gets `_rp(() => props.title)` (live) and under a DOM element gets
 * `bindPolymorphicText` (live). The carve-out's "reading once captures the
 * same value" justification only holds for non-reactive sources. So the
 * contract is now SPLIT:
 *
 *   - PROPS-BACKED stable refs (props-member reads `props.x`, splitProps
 *     holders `own.children`, prop-derived consts — `readsFromProps` /
 *     `referencesPropDerived`, checked on the type-UNWRAPPED expression)
 *     → wrapped as `() => expr` (the same shape signal-call children
 *     already arrive in). Structural children consumers are protected by
 *     the ecosystem convention instead: `mountChild` handles function
 *     children, libraries own `resolveChildren` (kinetic since #731), and
 *     `pyreon/no-iterate-children-without-resolve` enforces it at lint.
 *   - PLAIN stable refs (module consts, locals, loop items — nothing
 *     getter-backed) → still emitted bare (the Era-1 protection, kept
 *     where it is actually loss-free).
 *   - Dynamic shapes (calls, binary/logical/conditional) → wrap, as always.
 *
 * Both branches slice the type-UNWRAPPED expression (`as T` / `!` are
 * runtime-erased) so the two backends stay byte-identical — locked by the
 * `cross-backend: component-child stable-reference carve-out` block in
 * native-equivalence.test.ts and the seeded fuzz grammar.
 *
 * Bisect (#2348 fix): revert the `propBacked` branch in
 * `handleJsxExpression` (jsx.ts) → the PROPS-BACKED contract specs fail
 * (emit reverts to bare/frozen); the PLAIN-stable-ref spec and the
 * CONTROLs stay green (proving the carve-out split is surgical).
 *
 * Note: `transformJSX_JS` returns Pyreon-transformed SOURCE — JSX stays as
 * JSX (the final JSX→jsx() lowering is esbuild's job). So the emitted
 * expression shows up between `{...}` in the output text.
 */
import { describe, expect, test } from 'vitest'
import { transformJSX_JS } from '../jsx'

const t = (src: string): string => transformJSX_JS(src, 'test.tsx').code

describe('JSX transform — component child: stable-reference contract (#2348)', () => {
  test('CONTRACT (#2348) — direct props-member child is wrapped live', () => {
    // The issue's minimal proof: attr and child must BOTH be live.
    const src = `
      const B = (props) => <Heading label={props.title}>{props.title}</Heading>
    `
    const out = t(src)
    expect(out, 'attr keeps the _rp wrap').toContain('_rp(() => props.title)')
    // (plain toContain — the attr's own `=>` defeats a `<Heading[^>]*>` regex)
    expect(out, 'child gets the accessor (was bare/frozen pre-#2348)').toContain(
      '>{() => props.title}</Heading>',
    )
  })

  test('CONTRACT (#2348) — bare Identifier (splitProps-derived const) is wrapped live', () => {
    // The bokisch.com Intro shape, distilled. Pre-#2348 this emitted the
    // inlined value BARE — getter fired once at jsx() time, frozen child.
    const src = `
      const Comp = (props) => {
        const [childHolder, restHtml] = splitProps(props, ['children'])
        const children = childHolder.children
        return <Inner>{children}</Inner>
      }
    `
    const out = t(src)
    expect(out, 'prop-derived child must be wrapped (inlined + accessor)').toMatch(
      /<Inner>\s*\{\(\) => \(?childHolder\.children\)?\}\s*<\/Inner>/,
    )
  })

  test('CONTRACT (#2348) — props-backed MemberExpression chain is wrapped live', () => {
    const src = `
      const Comp = (props) => {
        const [obj] = splitProps(props, ['deep'])
        return <Inner>{obj.deep.x}</Inner>
      }
    `
    const out = t(src)
    expect(out, 'props-backed member chain must be wrapped').toMatch(
      /<Inner>\s*\{\(\) => obj\.deep\.x\}\s*<\/Inner>/,
    )
  })

  test('CONTRACT (#2348) — TS-cast wrapper (`as VNode[]`) is transparent and wraps live', () => {
    // The exact kinetic shape: `<StaggerRenderer>{children as VNode[]}</StaggerRenderer>`.
    // The cast is runtime-erased; both backends slice the UNWRAPPED
    // expression so the emit is byte-identical (native-equivalence lock).
    const src = `
      const Kinetic = (props) => {
        const [childHolder] = splitProps(props, ['children'])
        const children = childHolder.children
        return <Inner>{children as VNode[]}</Inner>
      }
    `
    const out = t(src)
    expect(out, 'cast must not hide the props-backed classification').toMatch(
      /<Inner>\s*\{\(\) => \(?childHolder\.children\)?\}\s*<\/Inner>/,
    )
  })

  test('CONTRACT (#2348) — non-null `!` postfix is transparent and wraps live', () => {
    const src = `
      const Comp = (props) => {
        const [own] = splitProps(props, ['children'])
        return <Inner>{own.children!}</Inner>
      }
    `
    const out = t(src)
    expect(out).toMatch(/<Inner>\s*\{\(\) => own\.children\}\s*<\/Inner>/)
  })

  test('CONTRACT (#2348) — kinetic Stagger reproducer wraps live (resolveChildren handles it)', () => {
    // Exact shape from `createKineticComponent.tsx`. Era-1 asserted BARE
    // here; kinetic's own `resolveChildren` (PR #731) unwraps function
    // children at every structural consumption site, so the live accessor
    // is both safe AND fixes the frozen-children class for kinetic
    // consumers that re-render.
    const src = `
      const Kinetic = (props) => {
        const [childHolder, restHtml] = splitProps(props, ['children'])
        const children = childHolder.children
        return <StaggerRenderer htmlProps={restHtml}>{children}</StaggerRenderer>
      }
    `
    const out = t(src)
    expect(out).toMatch(
      /<StaggerRenderer[^>]*>\s*\{\(\) => \(?childHolder\.children\)?\}\s*<\/StaggerRenderer>/,
    )
  })

  test('CONTRACT (Era-1 kept) — PLAIN stable ref (non-props local) stays bare', () => {
    // The half of the original carve-out that is genuinely loss-free: a
    // stable reference with NO getter-backed source. Reading it once ===
    // reading it N times, and bare emission protects structural children
    // consumers without costing any reactivity.
    const src = `
      const Comp = () => {
        const obj = { x: 1 }
        return <Inner>{obj.x}</Inner>
      }
    `
    const out = t(src)
    expect(out, 'plain stable ref must NOT be wrapped').toMatch(
      /<Inner>\s*\{obj\.x\}\s*<\/Inner>/,
    )
  })

  test('CONTROL — CallExpression child KEEPS the wrap (preserves reactivity)', () => {
    const src = `
      const count = signal(0)
      const Comp = () => <Inner>{count()}</Inner>
    `
    const out = t(src)
    expect(out, 'call-expression child must keep the wrap').toContain('() => count()')
  })

  test('CONTROL — BinaryExpression child KEEPS the wrap', () => {
    const src = `
      const Comp = (props) => {
        const [own] = splitProps(props, ['a', 'b'])
        return <Inner>{own.a + own.b}</Inner>
      }
    `
    const out = t(src)
    expect(out, 'binary-expression child must keep the wrap').toMatch(/\(\)\s*=>/)
    expect(out).toContain('own.a')
    expect(out).toContain('own.b')
  })

  test('CONTROL — DOM-element parent with bare Identifier KEEPS the binding (reactive)', () => {
    const src = `
      const Comp = (props) => {
        const [own] = splitProps(props, ['children'])
        const children = own.children
        return <div>{children}</div>
      }
    `
    const out = t(src)
    expect(out, 'DOM-element child must route through a reactive path').not.toContain(
      '<div>{own.children}</div>',
    )
  })

  test('CONTROL — bare SIGNAL identifier KEEPS the wrap (auto-call + wrap is reactive)', () => {
    const src = `
      function C() {
        const count = signal(0)
        return <MyComp>{count}</MyComp>
      }
    `
    const out = t(src)
    expect(out, 'signal child must be wrapped + auto-called').toContain('() => count()')
  })

  test('CONTROL — already-arrow-wrapped child is unchanged (idempotent)', () => {
    const src = `
      const x = signal('a')
      const Comp = () => <Inner>{() => x()}</Inner>
    `
    const out = t(src)
    expect(out, 'user-written accessor must pass through').toContain('() => x()')
    expect(out).not.toContain('() => () =>')
  })
})
