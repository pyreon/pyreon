// PyreonSizedMap — the native runtime `@pyreon/sized-map` lowers to.
//
// A bounded map that evicts the OLDEST entry once the cap is exceeded, in two
// modes selected per instance:
//
//   - FIFO (default) — `get` does NOT touch ordering. Cheapest semantics.
//   - LRU-on-read (`lru: true`) — `get` moves the entry to the tail, so the
//     least-recently-USED entry is the one evicted.
//
// In BOTH modes `set` treats a key collision as a recency hit: the old entry is
// removed and the new one appended at the tail. That is what stops a
// just-written entry from being evicted on the very next call, and it is easy
// to get wrong by reading only the LRU branch.
//
// The ordering problem is the whole reason this file exists rather than a
// one-line typealias. JavaScript's `Map` preserves INSERTION ORDER, so the web
// implementation gets eviction for free from `map.keys().next()`. Swift's
// `Dictionary` is explicitly UNORDERED — iterating it can return any order and
// is not stable between runs — so the order has to be carried separately or
// the eviction victim is arbitrary.
//
// Complexity, stated honestly: `order` is an array, so a recency touch or a
// delete is O(n) in the number of live entries, where the web is O(1). That is
// a deliberate trade for a BOUNDED structure — `maxEntries` is small by
// construction (this is a cache), and an array of keys keeps the memory flat
// and the code obvious. A doubly-linked list would restore O(1) at the cost of
// node allocation per entry; if a caller ever needs a large cap, that is the
// change to make, not a silent tolerance of the linear scan.

import Foundation

public final class PyreonSizedMap<Key: Hashable, Value> {
    private var storage: [Key: Value] = [:]
    /// Live keys, OLDEST FIRST. The web side gets this from `Map`'s insertion
    /// order; Swift's Dictionary has none, so it is maintained explicitly.
    private var order: [Key] = []
    private let maxEntries: Int
    private let lru: Bool

    /// `maxEntries` is floored at 1, mirroring the web's `Math.max(1, …)`.
    /// A cap of 0 would make `set` evict the entry it just wrote, which is
    /// never what a caller means.
    public init(maxEntries: Int, lru: Bool = false) {
        self.maxEntries = max(1, maxEntries)
        self.lru = lru
    }

    public var size: Int { storage.count }

    /// Reads the value. Under `lru` this is a WRITE to the ordering — the
    /// entry moves to the tail — which is why it is not a computed subscript.
    public func get(_ key: Key) -> Value? {
        guard let value = storage[key] else { return nil }
        if lru { touch(key) }
        return value
    }

    public func set(_ key: Key, _ value: Value) {
        if storage[key] != nil {
            // Present already: refresh position rather than evict. Both modes
            // depend on this, not just LRU.
            removeFromOrder(key)
        } else if storage.count >= maxEntries {
            // Evict the oldest. `order` is non-empty here because the count
            // reached the cap and the cap is at least 1.
            let oldest = order.removeFirst()
            storage.removeValue(forKey: oldest)
        }
        storage[key] = value
        order.append(key)
    }

    @discardableResult
    public func delete(_ key: Key) -> Bool {
        guard storage.removeValue(forKey: key) != nil else { return false }
        removeFromOrder(key)
        return true
    }

    public func has(_ key: Key) -> Bool { storage[key] != nil }

    public func clear() {
        storage.removeAll()
        order.removeAll()
    }

    /// Keys in eviction order, oldest first — the same order the web's
    /// `.keys()` yields, which is what makes an assertion port across.
    public func keys() -> [Key] { order }

    public func values() -> [Value] { order.compactMap { storage[$0] } }

    public func entries() -> [(Key, Value)] {
        order.compactMap { key in storage[key].map { (key, $0) } }
    }

    private func touch(_ key: Key) {
        removeFromOrder(key)
        order.append(key)
    }

    private func removeFromOrder(_ key: Key) {
        if let idx = order.firstIndex(of: key) { order.remove(at: idx) }
    }
}
