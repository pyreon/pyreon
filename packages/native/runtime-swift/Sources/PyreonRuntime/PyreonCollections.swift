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
// moves it to the end; a duplicate key in a constructor keeps the first position with the last value. A `Record`
// additionally lists its array-index keys first (see "own-property order" below).

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

// ─── A string-keyed Record's own-property order ──────────────────────────────
//
// A JavaScript object does not list its keys in plain insertion order: `Object.keys`, `Object.values` and
// `JSON.stringify` put the ARRAY-INDEX keys ("0", "7", "42" — canonical integers up to 2³² − 2) first, in ascending
// numeric order, and every other key after them in insertion order. `{ b: 1, '2': 2, '1': 3 }` lists `1,2,b`. A `Map`
// keeps plain insertion order, so the rule is applied where a RECORD is observed — `Object.keys(r)` /
// `Object.values(r)` lower to the functions below, and a string-keyed map encodes in this order — never to the map's
// own storage, which a `Map` shares.

/// The value of an array-index key ("0", or a digit 1–9 followed by digits, at most 2³² − 2), or `nil`.
func pyreonArrayIndex(_ key: String) -> UInt64? {
    let utf8 = key.utf8
    guard let first = utf8.first, utf8.count <= 10, first >= 0x30, first <= 0x39 else { return nil }
    if first == 0x30 { return utf8.count == 1 ? 0 : nil }
    var n: UInt64 = 0
    for b in utf8 {
        guard b >= 0x30, b <= 0x39 else { return nil }
        n = n * 10 + UInt64(b - 0x30)
    }
    return n <= 4_294_967_294 ? n : nil
}

/// `keys` (insertion order) in a JavaScript object's own-property order.
func pyreonPropertyOrder(_ keys: [String]) -> [String] {
    var indices: [(UInt64, String)] = []
    var names: [String] = []
    for k in keys {
        if let i = pyreonArrayIndex(k) { indices.append((i, k)) } else { names.append(k) }
    }
    if indices.isEmpty { return keys }
    return indices.sorted { $0.0 < $1.0 }.map(\.1) + names
}

extension PyreonMap where Key == String {
    /// The keys in a JavaScript object's own-property order (array indices ascending, then insertion order).
    public var propertyKeys: [String] { pyreonPropertyOrder(keys) }
}

/// `Object.keys(record)`.
public func pyreonRecordKeys<V>(_ record: PyreonMap<String, V>) -> [String] { record.propertyKeys }

/// `Object.values(record)`, in the order `Object.keys` lists the keys.
public func pyreonRecordValues<V>(_ record: PyreonMap<String, V>) -> [V] { record.propertyKeys.map { record[$0]! } }

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
    /// A string-keyed map is a JSON object in the web's own-property order (`JSON.stringify(record)`: array-index
    /// keys ascending, then insertion order). So is an integer-keyed one (`Record<number, T>`): the web writes its keys
    /// as the numbers' text (`{"1":…}`), in the same order. Any other key type encodes the way Swift's own `Dictionary`
    /// does, as a flat `[k, v, k, v, …]` array.
    public func encode(to encoder: Encoder) throws {
        if Key.self == String.self {
            var c = encoder.container(keyedBy: PyreonMapKey.self)
            for k in pyreonPropertyOrder(keys as! [String]) { try c.encode(storage[k as! Key]!, forKey: PyreonMapKey(k)) }
        } else if Key.self == Int.self {
            var c = encoder.container(keyedBy: PyreonMapKey.self)
            for k in pyreonPropertyOrder(keys.map { String($0 as! Int) }) {
                try c.encode(storage[Int(k)! as! Key]!, forKey: PyreonMapKey(k))
            }
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
    /// The object's keys in DOCUMENT order, as the web's `JSON.parse` keeps them. `JSONDecoder`'s `allKeys` follows
    /// its internal dictionary (a per-process hash), so the order comes from the text, which
    /// `PyreonJSON.decoder(for:)` publishes under `userInfo` (by raw key, so this file does not need `PyreonJSON.swift`).
    /// A decoder that does not publish it keeps `allKeys`' order.
    fileprivate static func documentOrder(_ keys: [PyreonMapKey], _ decoder: Decoder) -> [PyreonMapKey] {
        guard let info = CodingUserInfoKey(rawValue: "pyreon.jsonKeyOrder"),
              let lookup = decoder.userInfo[info] as? ([CodingKey]) -> [String]?,
              let order = lookup(decoder.codingPath)
        else { return keys }
        let present = Set(keys.map(\.stringValue))
        return order.filter(present.contains).map(PyreonMapKey.init)
    }

    public init(from decoder: Decoder) throws {
        self.init()
        if Key.self == String.self {
            let c = try decoder.container(keyedBy: PyreonMapKey.self)
            for k in Self.documentOrder(c.allKeys, decoder) {
                self[k.stringValue as! Key] = try c.decode(Value.self, forKey: k)
            }
        } else if Key.self == Int.self, let c = try? decoder.container(keyedBy: PyreonMapKey.self) {
            // `Record<number, T>` arrives as a JSON OBJECT whose keys are the numbers' text, as the web writes it.
            // `Dictionary<Int, T>` (and this type, before) only read a `[k, v, …]` array, so the decode threw. The
            // web enumerates an object's integer keys in ASCENDING order whatever order they were written in, so they
            // are inserted sorted (`allKeys` is hash-ordered besides).
            var pairs: [(Int, PyreonMapKey)] = []
            for k in c.allKeys {
                guard let n = Int(k.stringValue) else {
                    throw DecodingError.dataCorruptedError(
                        forKey: k, in: c, debugDescription: "\"\(k.stringValue)\" is not an integer key")
                }
                pairs.append((n, k))
            }
            for (n, k) in pairs.sorted(by: { $0.0 < $1.0 }) { self[n as! Key] = try c.decode(Value.self, forKey: k) }
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
