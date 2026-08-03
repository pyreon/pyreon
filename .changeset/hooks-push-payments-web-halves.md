---
'@pyreon/hooks': minor
---

`usePush` and `usePayments` had no web halves — the fifth and sixth hooks
with the resolvability gap `useGeolocation` / `useDatabase` / `useWebSocket`
/ `useAuth` had. With these two, **every hook in the compiler's
`NATIVE_LOWERED_HOOKS` registry now has a web implementation** — the "one
source, three targets" import contract holds for the full lowered surface.

Both mirror their native containers (`PyreonPushNotifications` /
`PyreonPayments`, Swift + Kotlin verified line-for-line): pure reactive state
machines with an injected platform edge, which on these two services is not a
convenience but the only correct shape — a push token arrives through the
app's AppDelegate / FCM service natively and a service-worker subscription
flow on web; a purchase resolves through StoreKit / Play Billing natively and
Stripe / Payment Request on web. `start(register)` / `connect(register)` hand
the app handler thunks that drive the pure transitions, exactly as native.

The subtle native semantics are matched exactly and each has a test:
`push.fail` keeps the prior token + notifications (stale-while-error) and
only `tokenReceived` clears `error`; `push.start` never invokes `register`
twice; `pay.purchase(id)` is a TOTAL no-op when not connected (it does not
even enter the purchasing state — native guards before `purchaseStarted`);
`pay.purchaseSucceeded` deliberately does NOT clear `error`. Members are live
getters over signals with batched transitions; `error` narrows to
`string | null` per the compiler's SERVICE_OPTIONAL_FIELDS contract.

Bisect-verified: mutating the stale-while-error and unconnected-purchase
guards fails exactly the specs that document them. Hook count 53 → 55 across
every gated claim site.
