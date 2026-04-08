import { computed, signal } from '@pyreon/reactivity'
import { useStorage } from '@pyreon/storage'
import { defineStore } from '@pyreon/store'
import { CURRENCY_RATES, PRODUCTS } from './data/products'
import type { CartLine, Currency } from './data/types'

/**
 * Shop cart store.
 *
 * The cart is persisted to localStorage via `useStorage`, so a refresh
 * (or opening a new tab) keeps the items. The currency selection is
 * also persisted — switching from USD to EUR and reloading still
 * shows EUR.
 *
 * Why a composition store rather than a state-tree model:
 *   • The cart is a flat array of `{ productId, qty }` lines — no
 *     nested objects, no need for snapshots/patches.
 *   • `useStorage` already gives us a reactive signal with a
 *     persistence side-effect; wrapping it in defineStore just adds
 *     the action API on top.
 */
export const useCart = defineStore('shop-cart', () => {
  // Persisted cart lines — `app-showcase.cart` is the localStorage key.
  const lines = useStorage<CartLine[]>('app-showcase.cart', [])

  // Persisted currency selection.
  const currency = useStorage<Currency>('app-showcase.currency', 'USD')

  // Whether the cart drawer is open. Pure local UI state — explicitly
  // NOT persisted, otherwise navigating away from /shop with the
  // drawer open would leave it open on every other section's load.
  const drawerOpen = signal(false)

  // ── Derived ────────────────────────────────────────────────────────
  const itemCount = computed(() => {
    let total = 0
    for (const line of lines()) total += line.qty
    return total
  })

  /** Subtotal in USD before currency conversion. */
  const subtotalUsd = computed(() => {
    let total = 0
    for (const line of lines()) {
      const product = PRODUCTS.find((p) => p.id === line.productId)
      if (product) total += product.priceUsd * line.qty
    }
    return total
  })

  /** Subtotal in the active display currency. */
  const subtotalDisplay = computed(() => subtotalUsd() * (CURRENCY_RATES[currency()] ?? 1))

  // ── Actions ────────────────────────────────────────────────────────
  function addToCart(productId: string): void {
    const current = lines()
    const existing = current.find((l) => l.productId === productId)
    if (existing) {
      lines.set(current.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l)))
    } else {
      lines.set([...current, { productId, qty: 1 }])
    }
    drawerOpen.set(true)
  }

  function setQty(productId: string, qty: number): void {
    if (qty <= 0) {
      removeFromCart(productId)
      return
    }
    lines.set(lines().map((l) => (l.productId === productId ? { ...l, qty } : l)))
  }

  function removeFromCart(productId: string): void {
    lines.set(lines().filter((l) => l.productId !== productId))
  }

  function clearCart(): void {
    lines.set([])
  }

  function setCurrency(next: Currency): void {
    currency.set(next)
  }

  function openDrawer(): void {
    drawerOpen.set(true)
  }
  function closeDrawer(): void {
    drawerOpen.set(false)
  }
  function toggleDrawer(): void {
    drawerOpen.set(!drawerOpen())
  }

  return {
    lines,
    currency,
    drawerOpen,
    itemCount,
    subtotalUsd,
    subtotalDisplay,
    addToCart,
    setQty,
    removeFromCart,
    clearCart,
    setCurrency,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  }
})
