/**
 * Compiler hardening — JSX child of COMPONENT parent is NOT wrapped in an
 * accessor when the expression is a stable reference (Identifier or simple
 * MemberExpression chain).
 *
 * Reported root cause behind the kinetic Stagger + bokisch.com Intro repro
 * (PR #731 shipped the library-side workaround; this is the upstream fix).
 *
 * Pre-fix the compiler rewrote `<Comp>{children}</Comp>` (where `children`
 * is a local `const` derived from a getter — `const children = childHolder.children`
 * after `splitProps`) as `Comp({ ..., children: () => h.children })`. Receiving
 * components saw `props.children` as a FUNCTION instead of the expected
 * `VNode | VNode[]`. DOM-consuming code routes through `mountChild` which
 * handles function children correctly (via `mountReactive`), so the wrap is
 * invisible there. Libraries that iterate children at the VNode level
 * (kinetic's StaggerRenderer/TransitionItem) or `cloneVNode` them directly
 * were silently broken — the function spread produced `{type: undefined}`
 * and the DOM rendered literal `<undefined>` tags.
 *
 * Fix shape: for JSX children of COMPONENT parents (uppercase tag), skip
 * the accessor wrap when the expression is a stable reference. The
 * compiler's prop-inlining pass still runs (so `children` is replaced with
 * `h.children` at the JSX use site) but the resulting expression is
 * emitted bare. Dynamic shapes (CallExpression, BinaryExpression, etc.)
 * keep the wrap so `<Comp>{count()}</Comp>` and similar patterns stay
 * reactive end-to-end.
 *
 * Note: `transformJSX_JS` returns Pyreon-transformed SOURCE — JSX stays as
 * JSX (the final JSX→jsx() lowering is esbuild's job). So the inlined
 * expression shows up between `{...}` in the emitted text.
 *
 * Bisect: revert the `isComponentTag(...) && isStableReference(expr)`
 * carve-out in `handleJsxExpression` (jsx.ts) → the CONTRACT specs fail
 * (emit reverts to `{() => h.children}`); the wrap-still-fires CONTROL
 * specs stay green (proving the carve-out doesn't touch the call/binary
 * paths).
 */
import { describe, expect, test } from 'vitest'
import { transformJSX_JS } from '../jsx'

const t = (src: string): string => transformJSX_JS(src, 'test.tsx').code

describe('JSX transform — component child of stable reference', () => {
  test('CONTRACT — bare Identifier (splitProps-derived const) is emitted without accessor wrap', () => {
    // The bokisch.com Intro shape, distilled. `splitProps` registers
    // `childHolder` as a prop-derived binding; `const children = childHolder.children`
    // makes `children` prop-derived; the JSX child `{children}` would,
    // pre-fix, emit `{() => childHolder.children}`. Now emits the inlined
    // value bare.
    const src = `
      const Comp = (props) => {
        const [childHolder, restHtml] = splitProps(props, ['children'])
        const children = childHolder.children
        return <Inner>{children}</Inner>
      }
    `
    const out = t(src)
    expect(out, 'children must NOT be wrapped in an accessor').not.toContain('() =>')
    expect(out, 'inlined value must appear bare in JSX child position').toMatch(
      /<Inner>\s*\{\(?childHolder\.children\)?\}\s*<\/Inner>/,
    )
  })

  test('CONTRACT — simple MemberExpression chain is emitted without accessor wrap', () => {
    const src = `
      const Comp = (props) => {
        const [obj] = splitProps(props, ['deep'])
        return <Inner>{obj.deep.x}</Inner>
      }
    `
    const out = t(src)
    expect(out, 'member chain must NOT be wrapped in an accessor').not.toContain('() => obj.deep.x')
    expect(out, 'member chain must appear bare').toMatch(/<Inner>\s*\{obj\.deep\.x\}\s*<\/Inner>/)
  })

  test('CONTROL — CallExpression child KEEPS the wrap (preserves reactivity)', () => {
    // `<Comp>{count()}</Comp>` — the user explicitly reads a signal in the
    // child position. The wrap converts to `() => count()` so the
    // receiving component can subscribe via mountChild → mountReactive.
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
    // The carve-out only fires for COMPONENT parents (uppercase tag).
    // DOM-element children must still go through the reactive binding
    // path so mountChild/mountReactive can re-evaluate inside an effect.
    const src = `
      const Comp = (props) => {
        const [own] = splitProps(props, ['children'])
        const children = own.children
        return <div>{children}</div>
      }
    `
    const out = t(src)
    // The template path emits this as a reactive binding (_bindText /
    // _bindDirect / etc.), not a bare text-node. Either way, the
    // expression must still route through a reactive primitive.
    expect(out, 'DOM-element child must route through a reactive path').not.toContain(
      '<div>{own.children}</div>',
    )
  })

  test('CONTRACT — TS-cast wrapper (`as VNode[]`) is transparent', () => {
    // The EXACT shape `createKineticComponent.tsx` ships:
    //   `<StaggerRenderer>{children as VNode[]}</StaggerRenderer>`
    // The TS `as` cast wraps `children` as a `TSAsExpression`. Without
    // unwrapping, the carve-out misses the bokisch reproducer entirely.
    // The cast is preserved in the emit — esbuild's later TS-strip pass
    // removes it. Reproducer: pre-fix this test fails with
    // `expected to NOT contain '() =>'` because the wrap still fires.
    const src = `
      const Kinetic = (props) => {
        const [childHolder] = splitProps(props, ['children'])
        const children = childHolder.children
        return <Inner>{children as VNode[]}</Inner>
      }
    `
    const out = t(src)
    expect(out, 'TS-cast wrapper must not block the carve-out').not.toContain('() =>')
    // Slice unwraps the TS cast — output is just the inlined value.
    expect(out).toMatch(/<Inner>\s*\{\(?childHolder\.children\)?\}\s*<\/Inner>/)
  })

  test('CONTRACT — non-null `!` postfix is transparent', () => {
    const src = `
      const Comp = (props) => {
        const [own] = splitProps(props, ['children'])
        return <Inner>{own.children!}</Inner>
      }
    `
    const out = t(src)
    expect(out).not.toContain('() =>')
    expect(out).toMatch(/<Inner>\s*\{own\.children\}\s*<\/Inner>/)
  })

  test('CONTRACT — kinetic Stagger reproducer compiles to bare children prop', () => {
    // Exact shape from `packages/ui-system/kinetic/src/kinetic/createKineticComponent.tsx`.
    // Pre-fix emit (JSX child position): `{() => childHolder.children}`.
    // Post-fix emit: `{childHolder.children}` (no wrap).
    const src = `
      const Kinetic = (props) => {
        const [childHolder, restHtml] = splitProps(props, ['children'])
        const children = childHolder.children
        return <StaggerRenderer htmlProps={restHtml}>{children}</StaggerRenderer>
      }
    `
    const out = t(src)
    expect(out).not.toContain('() => childHolder.children')
    expect(out).not.toContain('() => children')
    expect(out).toMatch(
      /<StaggerRenderer[^>]*>\s*\{\(?childHolder\.children\)?\}\s*<\/StaggerRenderer>/,
    )
  })

  test('CONTROL — bare SIGNAL identifier KEEPS the wrap (auto-call + wrap is reactive)', () => {
    // `<Comp>{count}</Comp>` where count is a tracked signal — the user's
    // deliberate "make this reactive at the call site" pattern. The
    // compiler auto-calls (`count` → `count()`) AND wraps (`() => count()`)
    // so the receiving component re-evaluates in its mountReactive scope.
    // The stable-reference carve-out explicitly excludes signal references.
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
    // Users who explicitly want reactivity write `<Comp>{() => x()}</Comp>`.
    // The compiler's shouldWrap returns false for ArrowFunctionExpression,
    // so the carve-out never fires. The user's accessor passes through.
    const src = `
      const x = signal('a')
      const Comp = () => <Inner>{() => x()}</Inner>
    `
    const out = t(src)
    expect(out, 'user-written accessor must pass through').toContain('() => x()')
  })
})
