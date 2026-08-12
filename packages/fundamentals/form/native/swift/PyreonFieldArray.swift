// PyreonFieldArray — the SwiftUI half of `useFieldArray`, mirroring the web
// `@pyreon/form` surface one-for-one (items with STABLE KEYS + append /
// prepend / insert / remove / update / move / swap / replace / values).
//
// ## Why stable keys are the load-bearing part
//
// The web API exists so a dynamic list of form inputs can be rendered with
// keyed reconciliation (`<For by={i => i.key}>`) — removing row 1 must not
// re-key rows 2..n, or every input below the removal loses its identity
// (and its focus/IME state). The SwiftUI lowering has the IDENTICAL
// requirement: `ForEach(array.items, id: \.key)` needs a key that survives
// mutations. Keys are monotonically-assigned Ints, never reused, exactly
// like the web's `nextKey++`.
//
// ## String-specialized (v1, deliberate)
//
// The web hook is generic (`useFieldArray<T>`); the native container is
// String-valued because the whole PMTC form vocabulary is String-typed
// (`PyreonForm.values: [String: String]`, `TextField` bindings). A
// generic native container would buy nothing today and cost `Any`-shaped
// emit complexity. Documented divergence, revisit with typed forms.
//
// ## Not form-bound
//
// Like the web hook: a field array is an independent reactive list, not a
// `PyreonForm` member — compose them in the component (the tasks app's
// tags list submits by reading `tags.values()` in the submit handler).

import Foundation
import Observation

/// One keyed row. `key` is stable across mutations (never reused);
/// `value` is the row's current text.
public struct PyreonFieldArrayItem: Identifiable, Equatable {
    public let key: Int
    public var value: String
    public var id: Int { key }

    public init(key: Int, value: String) {
        self.key = key
        self.value = value
    }
}

/// Observable dynamic-list container — the SwiftUI half of `useFieldArray`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonFieldArray {
    /// Reactive keyed rows — render with `ForEach(array.items, id: \.key)`.
    public private(set) var items: [PyreonFieldArrayItem]
    private var nextKey: Int

    /// Number of rows (reactive through `items`).
    public var length: Int { items.count }

    public init(_ initial: [String] = []) {
        var key = 0
        self.items = initial.map { value in
            defer { key += 1 }
            return PyreonFieldArrayItem(key: key, value: value)
        }
        self.nextKey = key
    }

    private func makeItem(_ value: String) -> PyreonFieldArrayItem {
        defer { nextKey += 1 }
        return PyreonFieldArrayItem(key: nextKey, value: value)
    }

    /// Append a new row at the end.
    public func append(_ value: String) {
        items.append(makeItem(value))
    }

    /// Prepend a new row at the start — existing keys are untouched.
    public func prepend(_ value: String) {
        items.insert(makeItem(value), at: 0)
    }

    /// Insert a row at `index` (clamped to bounds, matching the web's
    /// splice semantics).
    public func insert(_ index: Int, _ value: String) {
        let at = min(max(index, 0), items.count)
        items.insert(makeItem(value), at: at)
    }

    /// Remove the row at `index`. Out-of-bounds is a no-op (the web's
    /// filter-by-index semantics — never a crash).
    public func remove(_ index: Int) {
        guard items.indices.contains(index) else { return }
        items.remove(at: index)
    }

    /// Update the value at `index`, KEEPING its key (the row's identity —
    /// and its focus — survives the edit). Out-of-bounds is a no-op.
    public func update(_ index: Int, _ value: String) {
        guard items.indices.contains(index) else { return }
        items[index].value = value
    }

    /// Move a row from one index to another. Invalid indices are a no-op.
    public func move(from: Int, to: Int) {
        guard items.indices.contains(from), items.indices.contains(to) else { return }
        let item = items.remove(at: from)
        items.insert(item, at: to)
    }

    /// Swap two rows by index. Invalid indices are a no-op.
    public func swap(_ indexA: Int, _ indexB: Int) {
        guard items.indices.contains(indexA), items.indices.contains(indexB) else { return }
        items.swapAt(indexA, indexB)
    }

    /// Replace ALL rows — every row gets a FRESH key (the web contract:
    /// replace is a new list, not an in-place edit).
    public func replace(_ values: [String]) {
        items = values.map { makeItem($0) }
    }

    /// All current values as a plain array (submit-handler shape).
    public func values() -> [String] {
        items.map(\.value)
    }
}
