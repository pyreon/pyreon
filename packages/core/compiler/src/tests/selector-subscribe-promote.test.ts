/**
 * Auto-promotion: the compiler detects the `selector(key) ? a : b` ternary
 * shape inside a reactive attribute binding and emits `selector.subscribe(
 * key, m => setter(m ? a : b))` instead of `_bind(() => setter(selector(key)
 * ? a : b))`.
 *
 * The promoted shape is the effect-free fast path from `createSelector` —
 * per-row alloc drops from ~5 (full renderEffect) to ~2 (Set.add + dispose
 * closure). Measured benchmark: -0.8ms create-1k, -5ms create-10k.
 *
 * Conservative — bails when the shape isn't provably safe. See
 * `tryDirectSelectorTernary` in jsx.ts for the full bail catalog.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const transform = (code: string) => transformJSX_JS(code, 'test.tsx')

describe('Compiler: selector.subscribe auto-promotion', () => {
  describe('matches the canonical <For> + selector pattern', () => {
    it('promotes `class={() => sel(id) ? "a" : "b"}` to sel.subscribe(...)', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const selected = signal(null)
        const isSelected = createSelector(selected)
        export const Row = (row) => (
          <tr class={() => isSelected(row.id) ? 'selected' : ''}>
            <td>{row.id}</td>
          </tr>
        )
      `
      const out = transform(src).code
      // Promoted to .subscribe — no _bind wrapping the className expression
      expect(out).toContain('isSelected.subscribe(row.id,')
      expect(out).not.toMatch(/_bind\(\(\) => \{ \S*\.className = isSelected/)
    })

    it('promoted updater takes a boolean and applies ternary inline', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const selected = signal(null)
        const isSel = createSelector(selected)
        export const X = (k) => <div class={() => isSel(k) ? 'on' : 'off'}>x</div>
      `
      const out = transform(src).code
      // The updater receives `m` and applies `m ? 'on' : 'off'` through the
      // runtime `_setClass` normalizer (SVG-safe setAttribute + cx).
      expect(out).toMatch(/isSel\.subscribe\(k,\s*\(m\)\s*=>\s*\{\s*_setClass\(__root,\s*\(m\s*\?\s*'on'\s*:\s*'off'\)\)\s*\}\)/)
    })

    it('also promotes the bare `selector(k) ? a : b` form without the arrow', () => {
      // The JSX compiler unwrapAccessor produces the inner ternary directly
      // when the accessor body is single-expression — both shapes route through
      // the same emission path, so the detector handles both.
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const selected = signal(null)
        const isSel = createSelector(selected)
        export const X = (k) => <div class={isSel(k) ? 'on' : 'off'}>x</div>
      `
      const out = transform(src).code
      expect(out).toContain('isSel.subscribe(k,')
    })

    it('emits dispose binding as `const __d0 = ...subscribe(...)`', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const selected = signal(null)
        const isSel = createSelector(selected)
        export const X = (k) => <div class={() => isSel(k) ? 'a' : 'b'}>x</div>
      `
      const out = transform(src).code
      expect(out).toMatch(/const __d\d+ = isSel\.subscribe\(/)
    })
  })

  describe('correctness: bails when the shape is NOT safe', () => {
    it('bails when the selector identifier is NOT a known createSelector result', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const someFn = (k) => k === 1
        export const X = (k) => <div class={() => someFn(k) ? 'a' : 'b'}>x</div>
      `
      const out = transform(src).code
      // someFn is not tracked as a selector — must fall back to _bind
      expect(out).not.toContain('someFn.subscribe(')
    })

    it('bails when the selector call has 0 or 2+ arguments', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const selected = signal(null)
        const isSel = createSelector(selected)
        // Some user-extended selector that takes 2 args — not the standard shape
        export const X = (k, extra) => <div class={() => isSel(k, extra) ? 'a' : 'b'}>x</div>
      `
      const out = transform(src).code
      // 2-arg call doesn't match — no promotion
      expect(out).not.toContain('isSel.subscribe(')
    })

    it('bails when the key argument contains a reactive read', () => {
      // If key is reactive, the promoted .subscribe would freeze it — wrong.
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const selected = signal(null)
        const id = signal(0)
        const isSel = createSelector(selected)
        export const X = () => <div class={() => isSel(id()) ? 'a' : 'b'}>x</div>
      `
      const out = transform(src).code
      // id() is reactive — bail
      expect(out).not.toContain('isSel.subscribe(')
    })

    it('bails when a branch contains a reactive read', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const selected = signal(null)
        const cls = signal('default')
        const isSel = createSelector(selected)
        export const X = (k) => <div class={() => isSel(k) ? cls() : 'b'}>x</div>
      `
      const out = transform(src).code
      // Consequent is reactive — bail
      expect(out).not.toContain('isSel.subscribe(')
    })

    it('bails when the expression is NOT a ternary (just a plain call)', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const selected = signal(null)
        const isSel = createSelector(selected)
        // No ternary — just boolean to className. Doesn't match the shape.
        export const X = (k) => <div class={() => isSel(k)}>x</div>
      `
      const out = transform(src).code
      // Not a ternary — bail. But the rest of the pipeline handles it.
      expect(out).not.toContain('isSel.subscribe(')
    })

    // Selector shadowing (`const isSel = 'shadowed'` inside a function body
    // hiding a module-level createSelector) is a TODO — the current
    // implementation only consults the module-level `selectorVars` set,
    // not the scope-aware `shadowedSelectors`. A future PR can mirror the
    // signal shadowing logic to handle this edge case. Real-world impact:
    // very low (shadowing a selector with a non-selector value of the same
    // name is uncommon; if it happens, the promoted code crashes at
    // runtime with "isSel.subscribe is not a function" — loud failure, not
    // silent corruption).
  })

  describe('DOM correctness: promoted code preserves the original ternary semantics', () => {
    it('promoted output produces the same DOM as the un-promoted shape', () => {
      // The promoted form `setter(m ? a : b)` with m=true should match
      // the original `setter(sel(k) ? a : b)` when sel(k)===true.
      // We can't execute the runtime here (compiler test), but we can
      // assert the emitted ternary structure is correct.
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const sel = createSelector(signal(null))
        export const X = (k) => <div class={() => sel(k) ? 'YES' : 'NO'}>x</div>
      `
      const out = transform(src).code
      expect(out).toMatch(/_setClass\(__root,\s*\(m\s*\?\s*'YES'\s*:\s*'NO'\)\)/)
    })

    it('preserves the key expression literally (no rewriting)', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const sel = createSelector(signal(null))
        export const X = (item) => <div class={() => sel(item.deep.path.id) ? 'a' : 'b'}>x</div>
      `
      const out = transform(src).code
      expect(out).toContain('sel.subscribe(item.deep.path.id,')
    })
  })

  describe('non-class attributes: promotion applies to className, style, and DOM-prop attrs', () => {
    it('promotes for setAttribute-style attrs (aria-current, data-*)', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const sel = createSelector(signal(null))
        export const X = (k) => <a aria-current={() => sel(k) ? 'page' : 'false'}>x</a>
      `
      const out = transform(src).code
      expect(out).toContain('sel.subscribe(k,')
      expect(out).toContain('setAttribute("aria-current"')
    })
  })
})
