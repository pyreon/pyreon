/**
 * The compile-gate stubs the `@pyreon/dnd` lowering's emit needs beyond the SwiftUI / Compose stub bundle: the
 * `PyreonSortableState` engine a `useSortable` declaration emits and the two modifiers `ref={s.containerRef}` /
 * `ref={s.itemRef(key)}` lower to. They mirror the REAL runtimes (`@pyreon/dnd/native`) exactly — a superset stub
 * masks real breakage, a narrower one manufactures it.
 *
 * Appended to the bundle only for an emit that names the engine (see {@link dndStubs}); the compiler never reads them.
 */

import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const DND_SWIFT_STUBS = `// @pyreon/dnd — the PyreonSortableState engine + its two View modifiers.
// Mirrors PyreonSortable.swift EXACTLY (minus @Observable/@available, which are
// runtime-reactivity/availability macros rather than type-level contract — the
// same omission PyreonTableState/PyreonNetworkStatus document).
public enum PyreonSortAxis: String, Equatable { case vertical, horizontal }
public enum PyreonDropEdge: String, Equatable { case top, bottom, left, right }
public final class PyreonSortableState<T> {
  public init(axis: PyreonSortAxis = .vertical) {}
  public func bind(
    items: @escaping () -> [T],
    by: @escaping (T) -> String,
    onReorder: @escaping ([T]) -> Void
  ) {}
  public func isActive(_ key: String) -> Bool { false }
  public func isOverKey(_ key: String) -> Bool { false }
  public func activeId() -> String? { nil }
  public func overId() -> String? { nil }
  public func overEdge() -> String? { nil }
  public func pickUp(_ key: String) {}
  public func dragOver(_ key: String, edge: PyreonDropEdge) {}
  public func dragLeave(_ key: String) {}
  public func cancel() {}
  @discardableResult
  public func drop(source: String, on target: String, edge: PyreonDropEdge) -> Bool { false }
  public static func moveIndex(_ list: [T], from: Int, to: Int) -> [T] { list }
  public func reordered(dragKey: String, dropKey: String, edge: PyreonDropEdge) -> [T]? { nil }
  public func edgeAt(_ point: CGPoint, in size: CGSize) -> PyreonDropEdge { .top }
  public private(set) var activeKey: String?
  public private(set) var overKey: String?
  public private(set) var currentEdge: PyreonDropEdge?
  public let axis: PyreonSortAxis = .vertical
}
extension View {
  public func pyreonSortableItem<T>(
    _ state: PyreonSortableState<T>,
    key: String
  ) -> some View { self }
  public func pyreonSortableContainer<T>(
    _ state: PyreonSortableState<T>
  ) -> some View { self }
}
`

export const DND_KOTLIN_STUBS = `// @pyreon/dnd — the PyreonSortableState engine. Mirrors PyreonSortable.kt.
// The Modifier extensions it pairs with (PyreonSortableModifier.kt) are top-level
// extensions on Modifier in the real runtime, and are declared the same way here.
enum class PyreonSortAxis { VERTICAL, HORIZONTAL }
enum class PyreonDropEdge { TOP, BOTTOM, LEFT, RIGHT }
class PyreonSortableState<T>(
  val axis: PyreonSortAxis = PyreonSortAxis.VERTICAL,
) {
  fun bind(items: () -> List<T>, by: (T) -> String, onReorder: (List<T>) -> Unit) {}
  fun isActive(key: String): Boolean = false
  fun isOverKey(key: String): Boolean = false
  fun activeId(): String? = null
  fun overId(): String? = null
  fun overEdge(): String? = null
  fun pickUp(key: String) {}
  fun dragBy(delta: Float, extent: Float) {}
  fun drop(): Boolean = false
  fun cancel() {}
  fun reordered(dragKey: String, dropKey: String, edge: PyreonDropEdge): List<T>? = null
  val activeKey: String? get() = null
  val overKey: String? get() = null
  val currentEdge: PyreonDropEdge? get() = null
  companion object {
    fun <T> moveIndex(list: List<T>, from: Long, to: Long): List<T> = list
  }
}
@Suppress("UNUSED_PARAMETER")
fun <T> Modifier.pyreonSortableItem(state: PyreonSortableState<T>, key: String): Modifier = this
@Suppress("UNUSED_PARAMETER")
fun <T> Modifier.pyreonSortableContainer(state: PyreonSortableState<T>): Modifier = this
`

/** The `PyreonSortableState` compile-gate stubs, appended only to an emit that names the engine or its modifiers. */
export const dndStubs: StubAugmentation = {
  swift: (source) => (/\bPyreonSort(?:ableState|Axis)\b|\bpyreonSortable(?:Item|Container)\b/.test(source) ? DND_SWIFT_STUBS : ''),
  kotlin: (source) => (/\bPyreonSort(?:ableState|Axis)\b|\bpyreonSortable(?:Item|Container)\b/.test(source) ? DND_KOTLIN_STUBS : ''),
}
