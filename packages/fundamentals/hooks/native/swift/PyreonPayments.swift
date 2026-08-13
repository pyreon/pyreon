// PyreonPayments — the SwiftUI side of Pyreon's cross-platform in-app
// purchase story (Tier 3). Mirrors a `usePayments` reactive surface and the
// Kotlin `PyreonPayments` one-for-one.
//
// ## What this delivers
//
// An `@Observable` reactive purchase-state container a paywall UI binds to:
//
//     pay.products        // the available products (id / name / price)
//     pay.ownedProductIds // product ids the user has purchased
//     pay.purchasing      // the product id currently being purchased, nil if idle
//     pay.error           // most recent failure, nil on success
//     pay.owns(id)        // convenience: is this product owned?
//
// A SwiftUI paywall reads `pay.products` to render the offer list, gates the
// premium feature on `pay.owns("pro")`, and shows a spinner on the row whose
// id equals `pay.purchasing`.
//
// ## Pure state + INJECTED store actions
//
// The purchase MECHANISM (StoreKit `Product.products(for:)` / `.purchase()` /
// `Transaction.updates`) is async + app-orchestrated — you trigger a purchase
// from a button and the SDK resolves later. So `PyreonPayments` is the
// reactive STATE + pure transitions (`productsLoaded` / `purchaseStarted` /
// `purchaseSucceeded` / `purchaseFailed` / `restored`), plus an INJECTED
// action seam: `connect(register:)` takes the app's StoreKit-backed
// `PyreonPaymentActions` (`purchase` / `restore`), and `purchase(_:)` /
// `restore()` route through it. The container stays StoreKit-free + fully
// unit-testable; the real StoreKit wiring is the app's / a device follow-up.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const pay = usePayments(productIds)` and emits a
// `PyreonPayments`; reads become container reads and the paywall buttons call
// `purchase(_:)` / `restore()`. Until then, usable by hand-written SwiftUI.

import Foundation
import Observation

/// An in-app purchase product — id + display name + formatted price.
/// Mirrors the Kotlin `PyreonProduct`.
public struct PyreonProduct: Sendable, Equatable {
    public let id: String
    public let displayName: String
    /// Localized formatted price (e.g. "$4.99") — the store already formats
    /// it per the user's storefront, so it is carried as a string.
    public let price: String

    public init(id: String, displayName: String, price: String) {
        self.id = id
        self.displayName = displayName
        self.price = price
    }
}

/// The store actions the app wires (StoreKit-backed). Returned by the app's
/// `register` so the container can drive `purchase` / `restore` without
/// importing StoreKit.
public struct PyreonPaymentActions {
    public let purchase: (String) -> Void
    public let restore: () -> Void

    public init(purchase: @escaping (String) -> Void, restore: @escaping () -> Void) {
        self.purchase = purchase
        self.restore = restore
    }
}

/// Observable purchase-state container — the SwiftUI half of `usePayments`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonPayments {
    /// The available products (loaded from the store).
    public private(set) var products: [PyreonProduct] = []
    /// Product ids the user owns (purchased or restored).
    public private(set) var ownedProductIds: Set<String> = []
    /// The product id currently being purchased, or `nil` when idle.
    public private(set) var purchasing: String?
    /// Most recent failure, or `nil` on success / before first action.
    public private(set) var error: Error?

    @ObservationIgnored private var actions: PyreonPaymentActions?

    public init() {}

    /// Convenience: does the user own `productId`?
    public func owns(_ productId: String) -> Bool { ownedProductIds.contains(productId) }

    // MARK: - Pure state-machine transitions

    /// Record the loaded product catalog.
    public func productsLoaded(_ products: [PyreonProduct]) {
        self.products = products
        self.error = nil
    }

    /// Enter the purchasing state for `productId` (clear prior error).
    public func purchaseStarted(_ productId: String) {
        purchasing = productId
        error = nil
    }

    /// Complete a purchase: add to owned, clear `purchasing`.
    public func purchaseSucceeded(_ productId: String) {
        ownedProductIds.insert(productId)
        purchasing = nil
    }

    /// Fail a purchase: set `error`, clear `purchasing`. Ownership unchanged.
    public func purchaseFailed(_ failure: Error) {
        error = failure
        purchasing = nil
    }

    /// Apply a restore: union the restored ids into owned, clear `error`.
    public func restored(_ productIds: [String]) {
        ownedProductIds.formUnion(productIds)
        error = nil
    }

    // MARK: - Injected store-action edge

    /// Wire the app's StoreKit-backed actions. Idempotent — a second call
    /// while connected is a no-op.
    public func connect(register: () -> PyreonPaymentActions) {
        guard actions == nil else { return }
        actions = register()
    }

    /// Trigger a purchase via the injected actions + enter the purchasing
    /// state. No-op (records nothing) if not connected.
    public func purchase(_ productId: String) {
        guard let actions else { return }
        purchaseStarted(productId)
        actions.purchase(productId)
    }

    /// Trigger a restore via the injected actions. No-op if not connected.
    public func restore() {
        actions?.restore()
    }
}
