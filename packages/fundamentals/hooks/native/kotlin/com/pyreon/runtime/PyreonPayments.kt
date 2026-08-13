// PyreonPayments — the Compose side of Pyreon's cross-platform in-app
// purchase story (Tier 3). Mirrors a `usePayments` reactive surface and the
// Swift `PyreonPayments` one-for-one.
//
// ## What this delivers
//
// A reactive purchase-state container (Compose `MutableState`, read `.value`)
// a paywall UI binds to:
//
//     pay.products.value        // the available products (id / name / price)
//     pay.ownedProductIds.value // product ids the user has purchased
//     pay.purchasing.value      // the product id being purchased, null if idle
//     pay.error.value           // most recent failure, null on success
//     pay.owns(id)              // convenience: is this product owned?
//
// ## Pure state + INJECTED store actions
//
// The purchase MECHANISM (Google Play Billing `BillingClient` /
// `launchBillingFlow` / `PurchasesUpdatedListener`) is async + app-
// orchestrated. So `PyreonPayments` is the reactive STATE + pure transitions
// + an INJECTED action seam: `connect(register)` takes the app's
// Billing-backed [PyreonPaymentActions] (`purchase` / `restore`), and
// `purchase(_)` / `restore()` route through it. The container stays
// Billing-free + fully unit-testable; the real Billing wiring is the app's /
// an Android-CI follow-up. (Same injected shape as Swift — symmetric.)
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const pay = usePayments(productIds)` and emits a
// `PyreonPayments`; reads become container reads and the paywall buttons call
// `purchase(_)` / `restore()`.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/** An in-app purchase product — id + display name + formatted price.
 * Mirrors the Swift `PyreonProduct`. */
public data class PyreonProduct(
    val id: String,
    val displayName: String,
    /** Localized formatted price (e.g. "$4.99") — the store already formats
     * it per the user's storefront, so it is carried as a string. */
    val price: String,
)

/** The store actions the app wires (Billing-backed). Returned by the app's
 * `register` so the container can drive `purchase` / `restore` without
 * importing the Billing SDK. */
public class PyreonPaymentActions(
    public val purchase: (String) -> Unit,
    public val restore: () -> Unit,
)

/**
 * Reactive purchase-state container — the Compose half of `usePayments`.
 * Exposes [products] / [ownedProductIds] / [purchasing] / [error] as Compose
 * `MutableState` (read `.value`).
 */
public class PyreonPayments {
    /** The available products (loaded from the store). */
    public val products: MutableState<List<PyreonProduct>> = mutableStateOf(emptyList())

    /** Product ids the user owns (purchased or restored). */
    public val ownedProductIds: MutableState<Set<String>> = mutableStateOf(emptySet())

    /** The product id currently being purchased, or null when idle. */
    public val purchasing: MutableState<String?> = mutableStateOf(null)

    /** Most recent failure, or null on success / before first action. */
    public val error: MutableState<Throwable?> = mutableStateOf(null)

    /** Convenience: does the user own [productId]? */
    public fun owns(productId: String): Boolean = ownedProductIds.value.contains(productId)

    // MARK: - Pure state-machine transitions

    /** Record the loaded product catalog. */
    public fun productsLoaded(products: List<PyreonProduct>) {
        this.products.value = products
        this.error.value = null
    }

    /** Enter the purchasing state for [productId] (clear prior error). */
    public fun purchaseStarted(productId: String) {
        purchasing.value = productId
        error.value = null
    }

    /** Complete a purchase: add to owned, clear [purchasing]. */
    public fun purchaseSucceeded(productId: String) {
        ownedProductIds.value = ownedProductIds.value + productId
        purchasing.value = null
    }

    /** Fail a purchase: set [error], clear [purchasing]. Ownership unchanged. */
    public fun purchaseFailed(failure: Throwable) {
        error.value = failure
        purchasing.value = null
    }

    /** Apply a restore: union the restored ids into owned, clear [error]. */
    public fun restored(productIds: List<String>) {
        ownedProductIds.value = ownedProductIds.value + productIds
        error.value = null
    }

    // MARK: - Injected store-action edge

    /** Wire the app's Billing-backed actions. Idempotent — a second call
     * while connected is a no-op. */
    public fun connect(register: () -> PyreonPaymentActions) {
        if (actions != null) return
        actions = register()
    }

    /** Trigger a purchase via the injected actions + enter the purchasing
     * state. No-op if not connected. */
    public fun purchase(productId: String) {
        val a = actions ?: return
        purchaseStarted(productId)
        a.purchase(productId)
    }

    /** Trigger a restore via the injected actions. No-op if not connected. */
    public fun restore() {
        actions?.restore?.invoke()
    }

    private var actions: PyreonPaymentActions? = null
}
