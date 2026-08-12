---
'@pyreon/native-compiler': minor
'@pyreon/toast': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`@pyreon/toast` works on iOS + Android — and its native runtime is **co-located in the package** (`@pyreon/toast/native/{swift,kotlin}/`), the per-package architecture rather than the monolithic `@pyreon/native-runtime-*`. This is the first package to prove that model end-to-end.

**Runtime (co-located) — `PyreonToast`** (Swift `@Observable` singleton / Kotlin `object`): a process-global observable queue (add/dismiss/remove/clear), newest-last, distinct monotonic ids, a bounded stack (drops the oldest past `maxToasts`), and an auto-dismiss timer. It ships in `@pyreon/toast/native/`, declared via the package.json `pyreon.native` field, so `pyreon-native wire` aggregates it into a native app build straight from the installed package — no monolith, native tree-shakes to what you import, and a third-party package can follow the same convention.

**Co-source verify gate** (`scripts/check-native-cosource.ts`, wired into the native-validate CI job): scans every package's `pyreon.native` sources and compiles + smoke-runs them against the stub harness (Kotlin via `verify-kotlin --source`, which gained a path override; Swift via `swiftc -parse-as-library` + run), so a co-located `.swift`/`.kt` can't rot silently now that it lives outside `@pyreon/native-runtime-*`'s own `src/`. Toast's queue behavior is unit-tested this way on both toolchains.

**Lowering:**
- `toast("msg")` → `PyreonToast.shared.add("msg", type: "info")` (Swift) / `PyreonToast.add("msg", "info")` (Kotlin). The message is any expression; a renamed import (`toast as notify`) is handled; a literal `{ duration }` (ms → the auto-dismiss; `0` = persistent) lowers.
- Preset methods `toast.success/error/warning/info/loading("msg")` select the type.
- `<Toaster />` → a native overlay iterating the reactive queue.

A new `toast-call` ExprIR kind is threaded through `parse` (gated on the `@pyreon/toast` import) + both emits + the `expr-utils` walkers + `infer-type`. Proven R2 (emit) + R3 (typecheck vs the compiler's `PyreonToast` stubs on swiftc + kotlinc); `native-toast.test.ts` 7 cases + the co-source gate.

**v1 scope (disclosed):** message + preset type + literal `duration` lower; the other options (`onDismiss`/`description`/`icon`/`action`) are dropped, and `toast.promise()` / `toast.update()` aren't lowered. `<Toaster />` is a minimal message stack (positioning/styling/animation are a follow-up). No device (Simulator/Emulator) proof yet — the runtime is unit-tested by the co-source gate and the emit is stub-typechecked.
