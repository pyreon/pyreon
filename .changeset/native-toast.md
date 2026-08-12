---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`@pyreon/toast` now works on iOS + Android — imperative toasts + `<Toaster />` lower to a native runtime (was warned web-only, and the `toast(...)` call previously emitted verbatim → a silent native-build break).

**Runtime — `PyreonToast`** (Swift `@Observable` singleton / Kotlin `object`): a process-global, observable queue of active toasts (`add` / `dismiss` / `remove` / `clear`), newest-last, distinct monotonic ids, a bounded stack (drops the oldest past `maxToasts`, mirroring the web `MAX_TOASTS`), and an auto-dismiss timer (`Task.sleep` / `delay`). The queue state is pure + unit-tested (Swift `swift test`: 3 cases; Kotlin `verify-kotlin --service=PyreonToast`: typecheck + smoke).

**Lowering:**
- `toast("msg")` → `PyreonToast.shared.add("msg", type: "info")` (Swift) / `PyreonToast.add("msg", "info")` (Kotlin). The message is any expression; a renamed import (`toast as notify`) is handled.
- Preset methods `toast.success/error/warning/info/loading("msg")` select the type (`loading` maps to `info` in v1).
- `<Toaster />` → a native overlay iterating the reactive queue (`ForEach(PyreonToast.shared.toasts)` / `PyreonToast.toasts.value.forEach`), so it re-renders as toasts appear/expire.

Proven R2 (emit) + R3 (typecheck against the `PyreonToast` stubs on both real toolchains — `swiftc` + `kotlinc`); `native-toast.test.ts` 6 cases.

**v1 scope (disclosed):** the message + preset type + a literal `duration` (ms → the auto-dismiss; `0` = persistent) lower; the other options (`onDismiss` / `description` / `icon` / `action`) are dropped, and `toast.promise()` / `toast.update()` are not lowered. The `<Toaster />` overlay is a minimal vertical stack of messages (positioning, per-type styling, and enter/leave animation are a follow-up). No device (Simulator/Emulator) proof yet — the runtime is unit-tested and the emit is stub-typechecked; a device proof arrives with an example that emits `toast(...)`.
