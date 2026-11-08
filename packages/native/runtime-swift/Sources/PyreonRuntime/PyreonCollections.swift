import Foundation

// JavaScript's `Map`, `Set` and string-keyed `Record` remember INSERTION ORDER: `[...m.keys()]`, `for (const [k, v]
// of m)`, `Object.entries(r)`, `JSON.stringify(r)` and a `<For>` over any of them all see entries in the order they
// were first added. Swift's `Dictionary` and `Set` do not — their order follows the hash, and Swift seeds its hashing
// per process, so the same source rendered the same `Record` in a different order on every launch.
//
// `PyreonMap` and `PyreonSet` are the ordered twins the compiler emits for those types. They keep the spelling the
// emitted code already uses for `Dictionary` / `Set` — dictionary / array literals, `m[k]` get and set,
// `removeValue(forKey:)`, `insert`, `contains`, `count`, `keys`, `values`, iteration as `(key:, value:)` pairs — so
// only the ORDER changes. Kotlin needs no twin: `mutableMapOf` / `mutableSetOf` are `LinkedHashMap` / `LinkedHashSet`.
//
// The web's rules, kept: setting an existing key replaces its value and keeps its position; deleting and re-adding
// moves it to the end; a duplicate key in a constructor keeps the first position with the last value.

public struct PyreonMap<Key: Hashable, Value>: ExpressibleByDictionaryLiteral, Sequence {
    /// The keys, in insertion order.
    public private(set) var keys: [Key] = []
    private var storage: [Key: Value] = [:]

    public init() {}

    public init(dictionaryLiteral elements: (Key, Value)...) {
        for (k, v) in elements { self[k] = v }
    }

    /// `new Map(pairs)`: later duplicates overwrite the value and keep the first position.
    public init<S: Sequence>(_ pairs: S) where S.Element == (Key, Value) {
        for (k, v) in pairs { self[k] = v }
    }

    public subscript(key: Key) -> Value? {
        get { storage[key] }
        set {
            guard let value = newValue else {
                removeValue(forKey: key)
                return
            }
            if storage.updateValue(value, forKey: key) == nil { keys.append(key) }
        }
    }

    @discardableResult
    public mutating func removeValue(forKey key: Key) -> Value? {
        guard let old = storage.removeValue(forKey: key) else { return nil }
        if let i = keys.firstIndex(of: key) { keys.remove(at: i) }
        return old
    }

    public mutating func removeAll() {
        keys.removeAll()
        storage.removeAll()
    }

    public var count: Int { keys.count }
    public var isEmpty: Bool { keys.isEmpty }

    /// The values, in their keys' insertion order.
    public var values: [Value] { keys.map { storage[$0]! } }

    public func makeIterator() -> IndexingIterator<[(key: Key, value: Value)]> {
        keys.map { (key: $0, value: storage[$0]!) }.makeIterator()
    }
}

extension PyreonMap: Equatable where Value: Equatable {
    /// Same entries in the same order — what an observer comparing two snapshots needs (`.onChange(of:)`).
    public static func == (a: PyreonMap, b: PyreonMap) -> Bool {
        a.keys == b.keys && a.keys.allSatisfy { a.storage[$0] == b.storage[$0] }
    }
}

extension PyreonMap: Hashable where Value: Hashable {
    public func hash(into hasher: inout Hasher) {
        for k in keys {
            hasher.combine(k)
            hasher.combine(storage[k]!)
        }
    }
}

private struct PyreonMapKey: CodingKey {
    let stringValue: String
    init(_ s: String) { stringValue = s }
    init?(stringValue: String) { self.stringValue = stringValue }
    var intValue: Int? { nil }
    init?(intValue: Int) { nil }
}

extension PyreonMap: Encodable where Key: Encodable, Value: Encodable {
    /// A string-keyed map is a JSON object in insertion order (the web's `JSON.stringify(record)`); any other key
    /// type encodes the way Swift's own `Dictionary` does, as a flat `[k, v, k, v, …]` array.
    public func encode(to encoder: Encoder) throws {
        if Key.self == String.self {
            var c = encoder.container(keyedBy: PyreonMapKey.self)
            for k in keys { try c.encode(storage[k]!, forKey: PyreonMapKey(k as! String)) }
        } else {
            var c = encoder.unkeyedContainer()
            for k in keys {
                try c.encode(k)
                try c.encode(storage[k]!)
            }
        }
    }
}

extension PyreonMap: Decodable where Key: Decodable, Value: Decodable {
    public init(from decoder: Decoder) throws {
        self.init()
        if Key.self == String.self {
            let c = try decoder.container(keyedBy: PyreonMapKey.self)
            for k in c.allKeys { self[k.stringValue as! Key] = try c.decode(Value.self, forKey: k) }
        } else {
            var c = try decoder.unkeyedContainer()
            while !c.isAtEnd {
                let k = try c.decode(Key.self)
                self[k] = try c.decode(Value.self)
            }
        }
    }
}

public struct PyreonSet<Element: Hashable>: ExpressibleByArrayLiteral, Sequence {
    /// The elements, in insertion order.
    public private(set) var elements: [Element] = []
    private var members: Set<Element> = []

    public init() {}

    public init(arrayLiteral elements: Element...) {
        for e in elements { insert(e) }
    }

    /// `new Set(iterable)`: a repeated element keeps its first position.
    public init<S: Sequence>(_ items: S) where S.Element == Element {
        for e in items { insert(e) }
    }

    @discardableResult
    public mutating func insert(_ e: Element) -> (inserted: Bool, memberAfterInsert: Element) {
        if members.insert(e).inserted {
            elements.append(e)
            return (true, e)
        }
        return (false, e)
    }

    @discardableResult
    public mutating func remove(_ e: Element) -> Element? {
        guard members.remove(e) != nil else { return nil }
        if let i = elements.firstIndex(of: e) { elements.remove(at: i) }
        return e
    }

    public mutating func removeAll() {
        elements.removeAll()
        members.removeAll()
    }

    public func contains(_ e: Element) -> Bool { members.contains(e) }
    public var count: Int { elements.count }
    public var isEmpty: Bool { elements.isEmpty }

    public func makeIterator() -> IndexingIterator<[Element]> { elements.makeIterator() }
}

extension PyreonSet: Equatable {
    public static func == (a: PyreonSet, b: PyreonSet) -> Bool { a.elements == b.elements }
}

extension PyreonSet: Hashable {
    public func hash(into hasher: inout Hasher) { hasher.combine(elements) }
}

extension PyreonSet: Encodable where Element: Encodable {
    public func encode(to encoder: Encoder) throws {
        var c = encoder.unkeyedContainer()
        for e in elements { try c.encode(e) }
    }
}

extension PyreonSet: Decodable where Element: Decodable {
    public init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        self.init()
        while !c.isAtEnd { insert(try c.decode(Element.self)) }
    }
}
