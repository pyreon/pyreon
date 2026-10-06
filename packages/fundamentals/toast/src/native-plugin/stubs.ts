/**
 * The compile-gate stubs the `@pyreon/toast` lowering's emit needs beyond the SwiftUI / Compose stub bundle: the `PyreonToast` queue an imperative `toast(...)` call pushes onto and the `<Toaster />` overlay reads.
 * They mirror the REAL runtimes (`@pyreon/toast/native`) exactly — a superset stub masks real breakage, a narrower one manufactures it.
 *
 * Appended to the bundle only for an emit that names the type (see {@link toastStubs}); the compiler never reads them.
 */

import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const TOAST_SWIFT_STUBS = `// PyreonToast — mirror of runtime-swift's PyreonToast.swift surface the emit
// touches: the shared singleton, \`toasts\` (a collection of Identifiable items
// with a \`message\`, iterated by the \`<Toaster/>\` ForEach), and the
// \`add(_:type:)\` the imperative \`toast(...)\` call lowers to.
public struct PyreonToastItem: Identifiable {
  public let id: String
  public let message: String
  public let type: String
}
public final class PyreonToast {
  public static let shared = PyreonToast()
  public private(set) var toasts: [PyreonToastItem] = []
  @discardableResult
  public func add(_ message: String, type: String = "info", duration: TimeInterval? = nil) -> String { "" }
  public func dismiss(_ id: String) {}
  public func clear() {}
}
`

export const TOAST_KOTLIN_STUBS = `// PyreonToast — mirror of runtime-kotlin's PyreonToast.kt surface the emit
// touches: the object singleton, \`toasts\` (a MutableState<List<Item>> the
// \`<Toaster/>\` forEach iterates, each item carrying \`message\`), and \`add\`.
data class PyreonToastItem(val id: String, val message: String, val type: String)
object PyreonToast {
  val toasts: MutableState<List<PyreonToastItem>> = mutableStateOf(emptyList())
  var maxToasts: Long = 50L
  fun add(message: String, type: String = "info", durationMillis: Long? = null): String = ""
  fun dismiss(id: String) {}
  fun clear() {}
}
`

/** The compile-gate stubs, appended only to an emit that names a type they declare. */
export const toastStubs: StubAugmentation = {
  swift: (source) => (/\bPyreonToast(?:Item)?\b/.test(source) ? TOAST_SWIFT_STUBS : ''),
  kotlin: (source) => (/\bPyreonToast(?:Item)?\b/.test(source) ? TOAST_KOTLIN_STUBS : ''),
}
