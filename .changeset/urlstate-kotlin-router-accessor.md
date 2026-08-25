---
'@pyreon/native-compiler': patch
---

`useUrlState`'s Kotlin emit called a router function that does not exist

It emitted `PyreonUrlState(useRouter(), …)`, but `@pyreon/native-router-kotlin`
ships `useNavigate` / `useParams` / `useLoaderData` and **no** `useRouter`. Every
such app failed a real `gradle assembleDebug` with
`Unresolved reference 'useRouter'`.

It survived because the Kotlin STUB declared a `useRouter()` — a stub WIDER than
the runtime, which is the failure mode a stub exists to prevent. Local checks,
the compiler suite and the coverage gate all passed; only a device build could
fail.

The emit now reads `LocalPyreonRouter.current`, which is what the runtime's own
hooks use, and the stub no longer declares the phantom function — so the same
mistake now fails at stub level instead of on a device.
