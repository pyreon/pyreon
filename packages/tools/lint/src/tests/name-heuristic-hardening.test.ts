import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * Rules that used to key on what a thing was NAMED now key on what it IS.
 *
 * A rule gated on `name.toLowerCase().includes('store')` is disabled by
 * renaming a variable — which is not a decision anyone makes deliberately, so
 * the rule silently stops enforcing and nothing says so. Same shape as the
 * `observer` / `server` misclassification: the heuristic is invisible until it
 * is wrong.
 *
 * The name stays as a FALLBACK — it still catches a store obtained in a way
 * the binding analysis cannot see — but it is no longer the only signal.
 */

const at = (rule: string, src: string, file = '/proj/src/a.tsx') =>
  lintFile(file, src, allRules, { rules: { [rule]: 'error' } }).diagnostics.length

describe('pyreon/no-mutate-store-state — binding, not name', () => {
  const RULE = 'pyreon/no-mutate-store-state'

  it('fires when the store variable is named ...Store', () => {
    expect(
      at(RULE, `import { useCartStore } from '@pyreon/store'
export function C() { const cartStore = useCartStore(); cartStore.count.set(1); return cartStore }`),
    ).toBe(1)
  })

  it('STILL fires when the variable is renamed — the defect this closes', () => {
    expect(
      at(RULE, `import { useCartStore } from '@pyreon/store'
export function C() { const cart = useCartStore(); cart.count.set(1); return cart }`),
    ).toBe(1)
  })

  it('stays quiet on an unrelated object with a .set() member', () => {
    expect(at(RULE, `export function C() { const box = makeBox(); box.count.set(1); return box }`)).toBe(0)
  })

  it('recognises a store from a `defineStore` binding', () => {
    expect(
      at(RULE, `import { defineStore } from '@pyreon/store'
export function C() { const s = defineStore('x', () => ({})); s.count.set(1); return s }`),
    ).toBe(1)
  })
})

describe('pyreon/toast-a11y — import, not tag spelling', () => {
  const RULE = 'pyreon/toast-a11y'

  it('fires on a PascalCase *Toast* element with no live-region intent', () => {
    expect(at(RULE, `export const A = () => <MyToast />`)).toBe(1)
  })

  it('does NOT fire on the shipped <Toaster> under an ALIAS — it has its own live region', () => {
    // Matching the literal spelling `Toaster` meant an aliased import was
    // reported for missing a11y it already provides: a false positive on the
    // library's own component. The exemption now follows the import.
    expect(
      at(RULE, `import { Toaster as AppToast } from '@pyreon/toast'
export const A = () => <AppToast />`),
    ).toBe(0)
  })

  it('still fires on a user component that merely looks toast-ish', () => {
    expect(
      at(RULE, `import { Toaster } from '@pyreon/toast'
export const A = () => <><Toaster /><MyToast /></>`),
    ).toBe(1)
  })

  it('stays quiet once role / aria-live declares the intent', () => {
    expect(at(RULE, `export const A = () => <MyToast role="status" aria-live="polite" />`)).toBe(0)
  })

  it('stays quiet on an unrelated component', () => {
    expect(at(RULE, `export const A = () => <Card />`)).toBe(0)
  })
})
