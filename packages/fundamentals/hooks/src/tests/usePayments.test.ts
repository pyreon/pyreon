// usePayments had no web half — the sixth and LAST hook with the
// resolvability gap. With this file every hook in the compiler's
// `NATIVE_LOWERED_HOOKS` registry has a web implementation.
//
// These tests assert the SHARED-CODE CONTRACT against `PyreonPayments`
// (Swift + Kotlin, verified line-for-line). The subtle ones — `purchase()`
// being a TOTAL no-op when not connected, `purchaseSucceeded` NOT clearing
// `error` — are deliberate native semantics; matching them exactly is the
// whole point of the mirror.

import { effect } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { usePayments, type PyreonProduct } from '../usePayments'

const pro: PyreonProduct = { id: 'pro', displayName: 'Pro', price: '$4.99' }
const team: PyreonProduct = { id: 'team', displayName: 'Team', price: '$9.99' }

describe('usePayments — the web half of PyreonPayments', () => {
  it('starts empty: no products, nothing owned, idle, no error', () => {
    const pay = usePayments()
    expect(pay.products).toEqual([])
    expect(pay.ownedProductIds.size).toBe(0)
    expect(pay.purchasing).toBeNull()
    expect(pay.error).toBeNull()
    expect(pay.owns('pro')).toBe(false)
  })

  it('productsLoaded records the catalog and clears error', () => {
    const pay = usePayments()
    pay.purchaseFailed('old failure')
    pay.productsLoaded([pro, team])
    expect(pay.products.map((p) => p.id)).toEqual(['pro', 'team'])
    expect(pay.error).toBeNull()
  })

  it('the purchase lifecycle: started → succeeded adds ownership, clears purchasing', () => {
    const pay = usePayments()
    pay.purchaseStarted('pro')
    expect(pay.purchasing).toBe('pro')
    pay.purchaseSucceeded('pro')
    expect(pay.purchasing).toBeNull()
    expect(pay.owns('pro')).toBe(true)
  })

  it('purchaseSucceeded does NOT clear error — only loaded/started/restored do', () => {
    // Mirrors the Swift container exactly: `purchaseSucceeded` touches only
    // ownership + purchasing. A prior unrelated failure stays visible until
    // a transition that is DOCUMENTED to clear it.
    const pay = usePayments()
    pay.purchaseFailed('unrelated earlier failure')
    pay.purchaseSucceeded('pro')
    expect(pay.error).toBe('unrelated earlier failure')
    pay.restored([])
    expect(pay.error).toBeNull()
  })

  it('purchaseFailed sets error, clears purchasing, leaves ownership unchanged', () => {
    const pay = usePayments()
    pay.purchaseSucceeded('pro')
    pay.purchaseStarted('team')
    pay.purchaseFailed('card declined')
    expect(pay.error).toBe('card declined')
    expect(pay.purchasing).toBeNull()
    expect(pay.owns('pro')).toBe(true)
    expect(pay.owns('team')).toBe(false)
  })

  it('restored unions ids into owned and clears error', () => {
    const pay = usePayments()
    pay.purchaseSucceeded('pro')
    pay.purchaseFailed('stale')
    pay.restored(['team', 'pro'])
    expect(pay.owns('pro')).toBe(true)
    expect(pay.owns('team')).toBe(true)
    expect(pay.error).toBeNull()
  })

  it('purchase() is a TOTAL no-op when not connected — not even purchasing flips', () => {
    // Native: `guard let actions else { return }` runs BEFORE
    // `purchaseStarted`, so an unconnected purchase records NOTHING. A web
    // half that entered the purchasing state here would show a spinner that
    // can never resolve — a target-divergence bug, not a nicety.
    const pay = usePayments()
    pay.purchase('pro')
    expect(pay.purchasing).toBeNull()
    expect(pay.error).toBeNull()
  })

  it('connect wires the actions; purchase routes through them AFTER entering purchasing; connect is idempotent', () => {
    const pay = usePayments()
    const calls: string[] = []
    let registered = 0
    pay.connect(() => {
      registered += 1
      return {
        purchase(id) {
          // The container must already be in the purchasing state when the
          // app's SDK edge runs — the paywall spinner keys off it.
          calls.push(`${id}:${pay.purchasing}`)
        },
        restore() {
          calls.push('restore')
        },
      }
    })
    pay.connect(() => {
      registered += 1
      return { purchase() {}, restore() {} }
    })
    expect(registered).toBe(1)
    pay.purchase('pro')
    pay.restore()
    expect(calls).toEqual(['pro:pro', 'restore'])
  })

  it('the members are LIVE reactive reads — the load-bearing liveness spec', () => {
    const pay = usePayments()
    const seen: string[] = []
    const fx = effect(() => {
      seen.push(`${pay.purchasing ?? '-'}:${pay.owns('pro')}`)
    })
    pay.purchaseStarted('pro')
    pay.purchaseSucceeded('pro')
    fx.dispose()
    expect(seen).toEqual(['-:false', 'pro:false', '-:true'])
  })
})
