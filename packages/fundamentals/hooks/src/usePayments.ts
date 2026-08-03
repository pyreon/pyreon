// usePayments — the in-app-purchase state container, shared across
// web / iOS / Android.
//
// The native half exists on both targets: PMTC lowers `usePayments()` to
// `PyreonPayments` (`@Observable` Swift / Compose-state Kotlin). The WEB half
// did not exist — the sixth and LAST hook with the resolvability gap
// `useGeolocation` / `useDatabase` / `useWebSocket` / `useAuth` / `usePush`
// had: PMTC matches hook NAMES and never resolves imports, so the shared
// import resolved on native and nowhere else. With this file, every hook in
// the compiler's `NATIVE_LOWERED_HOOKS` registry has a web implementation.
//
// MEMBER NAMES AND TRANSITION SEMANTICS MIRROR `PyreonPayments` EXACTLY:
//
//   products          [PyreonProduct]  -> PyreonProduct[]
//   ownedProductIds   Set<String>      -> ReadonlySet<string>
//   purchasing        String?          -> string | null   (the compiler's
//                       SERVICE_OPTIONAL_FIELDS types it `string`)
//   error             Error?           -> string | null
//   owns(id)          convenience membership read
//   productsLoaded / purchaseStarted / purchaseSucceeded / purchaseFailed /
//   restored — the pure transitions
//   connect(register) / purchase(id) / restore() — the injected action seam
//
// PURE STATE + INJECTED STORE ACTIONS — the same design on all three targets:
// the purchase MECHANISM (StoreKit / Play Billing natively; Stripe, Paddle,
// or the Payment Request API on web) is async and app-orchestrated, so the
// container owns only the reactive STATE those flows drive. `connect`
// receives the app's actions (`purchase` / `restore`); `purchase(id)` routes
// through them after entering the purchasing state. The container stays
// SDK-free and synchronously unit-testable on every target.
//
// TRANSITION DETAILS THAT ARE EASY TO GET WRONG (each mirrors the Swift/Kotlin
// containers line-for-line, and each has a test):
//   - `purchase(id)` is a TOTAL no-op when not connected — it does not even
//     enter the purchasing state (native: `guard let actions else { return }`
//     BEFORE `purchaseStarted`).
//   - `purchaseSucceeded` clears `purchasing` but deliberately does NOT clear
//     `error` (only `productsLoaded` / `purchaseStarted` / `restored` do).
//   - `purchaseFailed` clears `purchasing`; ownership is unchanged.
//   - `connect` is idempotent — a second call while connected is a no-op.
//   - `price` is a pre-formatted STRING (the store formats per storefront);
//     carrying a number here would diverge from what native can render.

import { batch, signal } from '@pyreon/reactivity'

/** An in-app product — id + display name + pre-formatted localized price. */
export interface PyreonProduct {
  readonly id: string
  readonly displayName: string
  /** Localized formatted price (e.g. `"$4.99"`) — a string on every target. */
  readonly price: string
}

/** The store actions the app wires (its payment-SDK edge). */
export interface PyreonPaymentActions {
  purchase(productId: string): void
  restore(): void
}

/** Purchase-state handle. Mirrors the native `PyreonPayments`. */
export interface UsePaymentsResult {
  /** The available products (loaded from the store). */
  readonly products: PyreonProduct[]
  /** Product ids the user owns (purchased or restored). */
  readonly ownedProductIds: ReadonlySet<string>
  /** The product id currently being purchased, or `null` when idle. */
  readonly purchasing: string | null
  /** Most recent failure, or `null` on success / before first action. */
  readonly error: string | null
  /** Convenience: does the user own `productId`? */
  owns(productId: string): boolean
  /** Record the loaded product catalog (clears `error`). */
  productsLoaded(products: PyreonProduct[]): void
  /** Enter the purchasing state for `productId` (clears `error`). */
  purchaseStarted(productId: string): void
  /** Complete a purchase: add to owned, clear `purchasing`. */
  purchaseSucceeded(productId: string): void
  /** Fail a purchase: set `error`, clear `purchasing`. Ownership unchanged. */
  purchaseFailed(failure: string): void
  /** Apply a restore: union the ids into owned, clear `error`. */
  restored(productIds: readonly string[]): void
  /** Wire the app's store actions. Idempotent while connected. */
  connect(register: () => PyreonPaymentActions): void
  /**
   * Trigger a purchase via the injected actions and enter the purchasing
   * state. A TOTAL no-op (no state change) when not connected.
   */
  purchase(productId: string): void
  /** Trigger a restore via the injected actions. No-op when not connected. */
  restore(): void
}

/**
 * Reactive purchase-state container — the web half of the cross-platform
 * `usePayments` story. See the header for the exact native mirror contract.
 */
export function usePayments(): UsePaymentsResult {
  const products = signal<PyreonProduct[]>([])
  const owned = signal<ReadonlySet<string>>(new Set())
  const purchasing = signal<string | null>(null)
  const error = signal<string | null>(null)

  let actions: PyreonPaymentActions | null = null

  const purchaseStarted = (productId: string): void => {
    batch(() => {
      purchasing.set(productId)
      error.set(null)
    })
  }

  return {
    get products() {
      return products()
    },
    get ownedProductIds() {
      return owned()
    },
    get purchasing() {
      return purchasing()
    },
    get error() {
      return error()
    },
    owns(productId) {
      return owned().has(productId)
    },
    productsLoaded(next) {
      batch(() => {
        products.set([...next])
        error.set(null)
      })
    },
    purchaseStarted,
    purchaseSucceeded(productId) {
      batch(() => {
        owned.set(new Set([...owned.peek(), productId]))
        purchasing.set(null)
      })
    },
    purchaseFailed(failure) {
      batch(() => {
        error.set(failure)
        purchasing.set(null)
      })
    },
    restored(productIds) {
      batch(() => {
        owned.set(new Set([...owned.peek(), ...productIds]))
        error.set(null)
      })
    },
    connect(register) {
      if (actions !== null) return
      actions = register()
    },
    purchase(productId) {
      if (actions === null) return
      purchaseStarted(productId)
      actions.purchase(productId)
    },
    restore() {
      actions?.restore()
    },
  }
}
