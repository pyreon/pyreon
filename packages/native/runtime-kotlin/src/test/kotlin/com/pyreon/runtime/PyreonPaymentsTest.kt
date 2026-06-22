// Smoke tests for PyreonPayments — the reactive purchase-state container.
// Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonPayments`.
//
// Scope: the PURE state machine + the injected-actions seam. The real Google
// Play Billing wiring is the app's / Android-CI's responsibility.

package com.pyreon.runtime

fun testPayInitialState() {
    val pay = PyreonPayments()
    check(pay.products.value.isEmpty()) { "products start empty" }
    check(pay.ownedProductIds.value.isEmpty()) { "owned starts empty" }
    check(pay.purchasing.value == null) { "purchasing starts null" }
    check(pay.error.value == null) { "error starts null" }
    check(!pay.owns("pro")) { "owns(pro) false initially" }
}

fun testPayProductsLoaded() {
    val pay = PyreonPayments()
    val products = listOf(
        PyreonProduct("pro", "Pro", "$4.99"),
        PyreonProduct("max", "Max", "$9.99"),
    )
    pay.productsLoaded(products)
    check(pay.products.value == products) { "products loaded" }
    check(pay.products.value[0].price == "$4.99") { "price carried" }
}

fun testPayPurchaseFlow() {
    val pay = PyreonPayments()
    pay.purchaseStarted("pro")
    check(pay.purchasing.value == "pro") { "purchaseStarted → purchasing=pro" }
    check(!pay.owns("pro")) { "not owned mid-purchase" }
    pay.purchaseSucceeded("pro")
    check(pay.purchasing.value == null) { "success clears purchasing" }
    check(pay.owns("pro")) { "success → owned" }
}

fun testPayPurchaseFailure() {
    val pay = PyreonPayments()
    pay.purchaseStarted("pro")
    pay.purchaseFailed(RuntimeException("declined"))
    check(pay.error.value != null) { "failure sets error" }
    check(pay.purchasing.value == null) { "failure clears purchasing" }
    check(!pay.owns("pro")) { "failure leaves ownership unchanged" }
}

fun testPayRestore() {
    val pay = PyreonPayments()
    pay.purchaseSucceeded("pro")
    pay.restored(listOf("max", "pro")) // pro already owned; max new
    check(pay.owns("pro")) { "pro still owned after restore" }
    check(pay.owns("max")) { "max owned after restore" }
    check(pay.ownedProductIds.value.size == 2) { "no duplicate from restore union" }
}

fun testPayConnectAndPurchaseRoutes() {
    val pay = PyreonPayments()
    var purchased: String? = null
    var restored = false
    pay.connect {
        PyreonPaymentActions(
            purchase = { purchased = it },
            restore = { restored = true },
        )
    }
    pay.purchase("pro")
    check(purchased == "pro") { "purchase routes through injected action" }
    check(pay.purchasing.value == "pro") { "purchase() enters purchasing state" }
    pay.restore()
    check(restored) { "restore routes through injected action" }
}

fun testPayConnectIsIdempotent() {
    val pay = PyreonPayments()
    var registrations = 0
    val register: () -> PyreonPaymentActions = {
        registrations++
        PyreonPaymentActions(purchase = {}, restore = {})
    }
    pay.connect(register)
    pay.connect(register)
    check(registrations == 1) { "connect() is idempotent" }
}

fun testPayPurchaseBeforeConnectIsNoop() {
    val pay = PyreonPayments()
    pay.purchase("pro") // no actions wired → no-op (must not crash)
    check(pay.purchasing.value == null) { "purchase before connect doesn't enter purchasing" }
    pay.restore() // also a safe no-op
}

fun testPayReactiveFieldShapes() {
    val pay = PyreonPayments()
    for (name in listOf("products", "ownedProductIds", "purchasing", "error")) {
        val t = pay::class.members.first { it.name == name }.returnType.toString()
        check(t.contains("MutableState")) { "$name MUST be a Compose MutableState. Actual: $t" }
    }
}

fun main() {
    testPayInitialState()
    testPayProductsLoaded()
    testPayPurchaseFlow()
    testPayPurchaseFailure()
    testPayRestore()
    testPayConnectAndPurchaseRoutes()
    testPayConnectIsIdempotent()
    testPayPurchaseBeforeConnectIsNoop()
    testPayReactiveFieldShapes()
    println("[PyreonPaymentsTest] all smoke tests passed")
}
