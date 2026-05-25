/**
 * Candidate 1: text-child selector ternary auto-promotion.
 *
 * Companion to PR #898 (which auto-promoted the className/attr path).
 * Detects `<text>{() => sel(k) ? a : b}</text>` and emits
 * `sel.subscribe(k, m => textNode.data = m ? a : b)` — same effect-free
 * per-key fast path as the className auto-promotion.
 *
 * The promoted shape skips the full `_bind` / renderEffect setup —
 * per-row alloc drops from ~5 (effect machinery) to ~2 (Set.add +
 * dispose closure). Identical bail catalog to the className path.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const transform = (code: string) => transformJSX_JS(code, 'test.tsx')

describe('Compiler: text-child selector.subscribe auto-promotion', () => {
  describe('matches the canonical text-child shape', () => {
    it('promotes `{() => sel(k) ? a : b}` text child to sel.subscribe(...)', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const selected = signal(null)
        const isSelected = createSelector(selected)
        export const Row = (row) => (
          <td>{() => isSelected(row.id) ? '✓' : ''}</td>
        )
      `
      const out = transform(src).code
      expect(out).toContain('isSelected.subscribe(row.id,')
      expect(out).toMatch(/__t0\.data = \(m \? '✓' : ''\)/)
    })

    it('emits dispose binding as `const __d0 = sel.subscribe(...)`', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const isSel = createSelector(signal(null))
        export const X = (k) => <span>{() => isSel(k) ? 'on' : 'off'}</span>
      `
      const out = transform(src).code
      expect(out).toMatch(/const __d\d+ = isSel\.subscribe\(/)
    })

    it('promoted updater receives `m` and applies ternary inline', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const isSel = createSelector(signal(null))
        export const X = (k) => <span>{() => isSel(k) ? 'YES' : 'NO'}</span>
      `
      const out = transform(src).code
      expect(out).toMatch(/isSel\.subscribe\(k,\s*\(m\)\s*=>\s*\{[^}]*__t0\.data = \(m \? 'YES' : 'NO'\)/)
    })

    it('preserves deep key expressions literally (row.deep.path.id)', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const sel = createSelector(signal(null))
        export const X = (item) => <span>{() => sel(item.deep.path.id) ? 'a' : 'b'}</span>
      `
      const out = transform(src).code
      expect(out).toContain('sel.subscribe(item.deep.path.id,')
    })
  })

  describe('correctness: bails when shape is NOT safe (mirrors className bail catalog)', () => {
    it('bails when selector identifier is NOT a known createSelector result', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const someFn = (k) => k === 1
        export const X = (k) => <span>{() => someFn(k) ? 'a' : 'b'}</span>
      `
      const out = transform(src).code
      expect(out).not.toContain('someFn.subscribe(')
      expect(out).toContain('_bind(')
    })

    it('bails when key argument contains a reactive read', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const id = signal(0)
        const isSel = createSelector(signal(null))
        export const X = () => <span>{() => isSel(id()) ? 'a' : 'b'}</span>
      `
      const out = transform(src).code
      expect(out).not.toContain('isSel.subscribe(')
    })

    it('bails when a branch contains a reactive read', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const cls = signal('x')
        const isSel = createSelector(signal(null))
        export const X = (k) => <span>{() => isSel(k) ? cls() : 'b'}</span>
      `
      const out = transform(src).code
      expect(out).not.toContain('isSel.subscribe(')
    })

    it('bails when expression is NOT a ternary (plain call)', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const isSel = createSelector(signal(null))
        export const X = (k) => <span>{() => isSel(k)}</span>
      `
      const out = transform(src).code
      expect(out).not.toContain('isSel.subscribe(')
    })

    it('bails when call has 2 args (not the standard shape)', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const isSel = createSelector(signal(null))
        export const X = (k, extra) => <span>{() => isSel(k, extra) ? 'a' : 'b'}</span>
      `
      const out = transform(src).code
      expect(out).not.toContain('isSel.subscribe(')
    })
  })

  describe('DOM correctness: promoted updater writes textNode.data with ternary applied', () => {
    it('writes data via `(m ? a : b)` form, parenthesized for safety', () => {
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const sel = createSelector(signal(null))
        export const X = (k) => <span>{() => sel(k) ? 'A' : 'B'}</span>
      `
      const out = transform(src).code
      expect(out).toMatch(/__t0\.data = \(m \? 'A' : 'B'\)/)
    })
  })
})
