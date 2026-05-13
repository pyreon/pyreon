import type { ComponentFn } from '@pyreon/core'
import rocketstyle from '../init'

// Type-level regression tests for the post-#225/#227 `.attrs()` overload
// split: (a) DFP widening makes `.attrs(obj)` keys optional at JSX call site,
// (b) callback overload preserves Pyreon's loose-return convention so
// `_documentProps` / `tag: 'a'` runtime extras still typecheck without
// per-callsite `as any` casts.
//
// These are not bisect-load-bearing at runtime — they're type-level
// assertions exercised by `tsc --noEmit`. Including them in the suite
// makes failures show up in the test report (vitest treats type errors
// as compile failures).
describe('attrs overloads — type-level contract', () => {
  // A minimal base component standing in for Text / Button / etc.
  // We only care about the type-level surface here.
  type BaseProps = {
    tag?: 'div' | 'span' | 'p' | 'h1' | 'h2' | 'h3'
    role?: string
  }
  const Base: ComponentFn<BaseProps> = () => null

  describe('object overload — keys become optional at JSX site (PR #225)', () => {
    it('accepts object with default values', () => {
      const Comp = rocketstyle()({ name: 'Comp', component: Base }).attrs({
        tag: 'div',
      })
      // The component is callable — at the JSX call site, `tag` is now
      // optional because `.attrs({ tag: 'div' })` provides a default.
      // Pre-#225 the type would have required `tag` at the JSX site.
      // We can't directly assert via `expectTypeOf` without the dep, but
      // the smoke is: the chain compiles without errors.
      expect(typeof Comp).toBe('function')
    })

    it('accepts new keys in attrs object', () => {
      // The attrs object can introduce new keys beyond the base component's
      // props (here: `customField`). The keys flow into the returned
      // component's extended-attrs `EA` and become typed props.
      const Comp = rocketstyle()({ name: 'Comp', component: Base }).attrs({
        customField: 'hello',
      })
      expect(typeof Comp).toBe('function')
    })
  })

  describe('callback overload — Pyreon convention for runtime extras', () => {
    it('accepts callback returning fields outside the base prop union (no as-cast needed)', () => {
      // This is the canonical document-primitive pattern: a Text-based
      // rocketstyle that overrides `tag` to a value outside Text's strict
      // `tag` union AND adds a runtime-only `_documentProps` marker. The
      // callback's return type intentionally allows `Record<string, unknown>`
      // for keys outside the user's explicit `<P>` generic, matching
      // Pyreon's pre-#225 convention.
      const Comp = rocketstyle()({ name: 'DocLink', component: Base }).attrs<{
        href?: string
      }>((props) => ({
        tag: 'a', // 'a' is NOT in BaseProps['tag'] — falls through Record<string, unknown>
        _documentProps: { href: props.href ?? '#' },
      }))
      expect(typeof Comp).toBe('function')
    })

    it('accepts callback returning literal values (contextual narrowing via <P>)', () => {
      // When the user passes an explicit `<P>` generic, the callback's
      // return is contextually typed against `Partial<P>`. Writing
      // `tag: 'h1'` stays narrow at literal `'h1'` — no `as const` needed.
      // Note: tag is in BaseProps['tag'] union so this typechecks against
      // BOTH the wildcard arm AND the explicit P-key arm.
      const Comp = rocketstyle()({ name: 'Heading', component: Base }).attrs<{
        level?: number
      }>((props) => ({
        tag: `h${props.level ?? 1}` as 'h1' | 'h2' | 'h3',
      }))
      expect(typeof Comp).toBe('function')
    })

    it('callback receives full DFP-typed props for narrow reads', () => {
      // The `props` arg passed to the callback IS strictly typed as
      // `Partial<DFP & P>` — so reading `props.tag` narrows against the
      // wrapped component's full surface. This is the "props narrow,
      // return loose" asymmetry Pyreon settled on.
      const Comp = rocketstyle()({ name: 'Probe', component: Base }).attrs<{
        scale?: number
      }>((props) => {
        // Type check: `props.scale` is `number | undefined`, `props.tag`
        // is the narrow BaseProps['tag'] union | undefined.
        const _scale: number | undefined = props.scale
        const _tag: 'div' | 'span' | 'p' | 'h1' | 'h2' | 'h3' | undefined = props.tag
        expect(_scale).toBeUndefined()
        expect(_tag).toBeUndefined()
        return { scale: 1 }
      })
      expect(typeof Comp).toBe('function')
    })
  })
})
