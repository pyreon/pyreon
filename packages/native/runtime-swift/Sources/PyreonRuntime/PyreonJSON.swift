// PyreonJSON — JSON for the native targets.
//
// `encode` is the serialization helper for the `<WebView>` live-data bridge:
// PMTC emits `PyreonJSON.encode(signal)` for `<WebView data={signal}>`. It
// encodes any Encodable value (PMTC-emitted structs are `Codable`) to a compact
// JSON string for the hosted page's `window.__pyreonData`. Never throws into the
// view layer — the JSON literal `null` on the (practically unreachable) encode
// failure, which the page reads as "no data yet".
//
// `stringify` is what `JSON.stringify(x)` lowers to, and it is held to a
// stricter bar: the BYTES must equal the web's `JSON.stringify` for the same
// value, because they leave the device — a request body a server signs or
// hashes, a cache key, a string another client compares. `JSONEncoder` fails
// that three ways: key ORDER (it does not follow the order a struct encodes its
// fields in, so `{ prompt, n }` could go out as `{"n":…,"prompt":…}`), `/`
// escaped as `\/`, and numbers (`1.0` for a whole Double on some OS versions,
// `NaN` throwing where JS writes `null`). So `stringify` walks the value with
// its own Encoder: object keys come out in the order the value encodes them —
// a synthesized `Codable` struct encodes in DECLARATION order, which PMTC
// derives from the source literal — and every leaf is written the way
// ECMAScript's `JSON.stringify` writes it.
//
// Two deliberate limits, stated rather than papered over: a `nil` optional is
// OMITTED (synthesized `Codable` uses `encodeIfPresent`; that is JS's
// `undefined`, whereas a JS `null` writes `"k":null`), and a `Dictionary` keeps
// Swift's unordered iteration (a JS object's insertion order is not recoverable
// from a hash map).

import Foundation

public enum PyreonJSON {
    public static func encode<T: Encodable>(_ value: T) -> String {
        guard let data = try? JSONEncoder().encode(value),
              let json = String(data: data, encoding: .utf8)
        else { return "null" }
        return json
    }

    /** The web's `JSON.stringify(value)`, byte for byte. */
    public static func stringify<T: Encodable>(_ value: T) -> String {
        let root = PyreonJSSlot()
        do {
            try value.encode(to: PyreonJSEncoder(slot: root, codingPath: []))
        } catch {
            return "null"
        }
        var out = ""
        root.write(into: &out)
        return out
    }

    // ─── ECMAScript leaf formatting ─────────────────────────────────────────

    /**
     * `Number::toString` as `JSON.stringify` applies it: the SHORTEST digits
     * that round-trip (Swift's `description` already produces them), laid out
     * by the ECMAScript rules — positional for exponents in (-7, 21], `1e+21`
     * / `1e-7` beyond. Non-finite values are `null`, `-0` is `0`.
     */
    static func jsNumber(_ value: Double) -> String {
        if !value.isFinite { return "null" }
        if value == 0 { return "0" }
        let negative = value < 0
        let text = (negative ? -value : value).description
        var mantissa = Substring(text)
        var exponent = 0
        if let e = text.firstIndex(where: { $0 == "e" || $0 == "E" }) {
            mantissa = text[..<e]
            exponent = Int(text[text.index(after: e)...]) ?? 0
        }
        var digits: [Character] = []
        var point = -1
        for ch in mantissa {
            if ch == "." { point = digits.count } else { digits.append(ch) }
        }
        if point < 0 { point = digits.count }
        // n: where the decimal point sits relative to the first digit.
        var n = point + exponent
        while digits.count > 1 && digits.first == "0" {
            digits.removeFirst()
            n -= 1
        }
        while digits.count > 1 && digits.last == "0" { digits.removeLast() }
        return (negative ? "-" : "") + layout(String(digits), n)
    }

    /** ECMAScript Number::toString layout for digits `s` (k of them) at point `n`. */
    static func layout(_ s: String, _ n: Int) -> String {
        let k = s.count
        if k <= n && n <= 21 { return s + String(repeating: "0", count: n - k) }
        if 0 < n && n <= 21 {
            let i = s.index(s.startIndex, offsetBy: n)
            return String(s[..<i]) + "." + String(s[i...])
        }
        if -6 < n && n <= 0 { return "0." + String(repeating: "0", count: -n) + s }
        let e = n - 1
        let sign = e < 0 ? "-" : "+"
        let head = String(s.first!)
        let tail = k == 1 ? "" : "." + String(s.dropFirst())
        return head + tail + "e" + sign + String(abs(e))
    }

    /** A JSON string literal escaped exactly as `JSON.stringify` escapes one. */
    static func jsString(_ value: String) -> String {
        var out = "\""
        for scalar in value.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 {
                    let hex = String(scalar.value, radix: 16)
                    out += "\\u" + String(repeating: "0", count: 4 - hex.count) + hex
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        return out + "\""
    }
}

// ─── The ordered tree the Encoder builds ─────────────────────────────────────

final class PyreonJSSlot {
    enum Node {
        case raw(String)
        case object(PyreonJSObject)
        case array(PyreonJSArray)
    }

    var node: Node?

    func write(into out: inout String) {
        switch node {
        case .raw(let text)?: out += text
        case .object(let o)?:
            out += "{"
            var first = true
            for (key, slot) in o.entries where slot.node != nil {
                if !first { out += "," }
                first = false
                out += PyreonJSON.jsString(key)
                out += ":"
                slot.write(into: &out)
            }
            out += "}"
        case .array(let a)?:
            out += "["
            for (i, slot) in a.items.enumerated() {
                if i > 0 { out += "," }
                // An array element that encoded nothing is `null`, as in JS.
                if slot.node == nil { out += "null" } else { slot.write(into: &out) }
            }
            out += "]"
        case nil: out += "null"
        }
    }

    func object() -> PyreonJSObject {
        if case .object(let o)? = node { return o }
        let o = PyreonJSObject()
        node = .object(o)
        return o
    }

    func array() -> PyreonJSArray {
        if case .array(let a)? = node { return a }
        let a = PyreonJSArray()
        node = .array(a)
        return a
    }
}

final class PyreonJSObject {
    var entries: [(String, PyreonJSSlot)] = []

    /** The slot for `key` — the existing one if the key was written before, so
     *  a re-write keeps the key's FIRST position, as a JS assignment does. */
    func slot(_ key: String) -> PyreonJSSlot {
        if let found = entries.first(where: { $0.0 == key }) { return found.1 }
        let s = PyreonJSSlot()
        entries.append((key, s))
        return s
    }
}

final class PyreonJSArray {
    var items: [PyreonJSSlot] = []

    func append() -> PyreonJSSlot {
        let s = PyreonJSSlot()
        items.append(s)
        return s
    }
}

struct PyreonJSIndexKey: CodingKey {
    var stringValue: String
    var intValue: Int?
    init(_ i: Int) { stringValue = String(i); intValue = i }
    init?(stringValue: String) { self.stringValue = stringValue; intValue = nil }
    init?(intValue: Int) { self.init(intValue) }
}

struct PyreonJSEncoder: Encoder {
    let slot: PyreonJSSlot
    var codingPath: [CodingKey]
    var userInfo: [CodingUserInfoKey: Any] { [:] }

    func container<Key: CodingKey>(keyedBy type: Key.Type) -> KeyedEncodingContainer<Key> {
        KeyedEncodingContainer(PyreonJSKeyed<Key>(object: slot.object(), codingPath: codingPath))
    }

    func unkeyedContainer() -> UnkeyedEncodingContainer {
        PyreonJSUnkeyed(array: slot.array(), codingPath: codingPath)
    }

    func singleValueContainer() -> SingleValueEncodingContainer {
        PyreonJSSingle(slot: slot, codingPath: codingPath)
    }
}

/** Leaf writes shared by all three container kinds. */
private func pyreonJSLeaf<T: Encodable>(_ value: T, into slot: PyreonJSSlot, path: [CodingKey]) throws {
    switch value {
    case let v as String: slot.node = .raw(PyreonJSON.jsString(v))
    case let v as Bool: slot.node = .raw(v ? "true" : "false")
    case let v as Double: slot.node = .raw(PyreonJSON.jsNumber(v))
    case let v as Float: slot.node = .raw(PyreonJSON.jsNumber(Double(v)))
    case let v as Int: slot.node = .raw(PyreonJSON.jsNumber(Double(v)))
    case let v as Int8: slot.node = .raw(PyreonJSON.jsNumber(Double(v)))
    case let v as Int16: slot.node = .raw(PyreonJSON.jsNumber(Double(v)))
    case let v as Int32: slot.node = .raw(PyreonJSON.jsNumber(Double(v)))
    case let v as Int64: slot.node = .raw(PyreonJSON.jsNumber(Double(v)))
    case let v as UInt: slot.node = .raw(PyreonJSON.jsNumber(Double(v)))
    case let v as UInt8: slot.node = .raw(PyreonJSON.jsNumber(Double(v)))
    case let v as UInt16: slot.node = .raw(PyreonJSON.jsNumber(Double(v)))
    case let v as UInt32: slot.node = .raw(PyreonJSON.jsNumber(Double(v)))
    case let v as UInt64: slot.node = .raw(PyreonJSON.jsNumber(Double(v)))
    default: try value.encode(to: PyreonJSEncoder(slot: slot, codingPath: path))
    }
}

struct PyreonJSKeyed<Key: CodingKey>: KeyedEncodingContainerProtocol {
    let object: PyreonJSObject
    var codingPath: [CodingKey]

    mutating func encodeNil(forKey key: Key) throws { object.slot(key.stringValue).node = .raw("null") }

    mutating func encode<T: Encodable>(_ value: T, forKey key: Key) throws {
        try pyreonJSLeaf(value, into: object.slot(key.stringValue), path: codingPath + [key])
    }

    mutating func nestedContainer<NestedKey: CodingKey>(keyedBy keyType: NestedKey.Type, forKey key: Key) -> KeyedEncodingContainer<NestedKey> {
        KeyedEncodingContainer(PyreonJSKeyed<NestedKey>(object: object.slot(key.stringValue).object(), codingPath: codingPath + [key]))
    }

    mutating func nestedUnkeyedContainer(forKey key: Key) -> UnkeyedEncodingContainer {
        PyreonJSUnkeyed(array: object.slot(key.stringValue).array(), codingPath: codingPath + [key])
    }

    mutating func superEncoder() -> Encoder {
        PyreonJSEncoder(slot: object.slot("super"), codingPath: codingPath)
    }

    mutating func superEncoder(forKey key: Key) -> Encoder {
        PyreonJSEncoder(slot: object.slot(key.stringValue), codingPath: codingPath + [key])
    }
}

struct PyreonJSUnkeyed: UnkeyedEncodingContainer {
    let array: PyreonJSArray
    var codingPath: [CodingKey]
    var count: Int { array.items.count }

    mutating func encodeNil() throws { array.append().node = .raw("null") }

    mutating func encode<T: Encodable>(_ value: T) throws {
        let key = PyreonJSIndexKey(count)
        try pyreonJSLeaf(value, into: array.append(), path: codingPath + [key])
    }

    mutating func nestedContainer<NestedKey: CodingKey>(keyedBy keyType: NestedKey.Type) -> KeyedEncodingContainer<NestedKey> {
        KeyedEncodingContainer(PyreonJSKeyed<NestedKey>(object: array.append().object(), codingPath: codingPath))
    }

    mutating func nestedUnkeyedContainer() -> UnkeyedEncodingContainer {
        PyreonJSUnkeyed(array: array.append().array(), codingPath: codingPath)
    }

    mutating func superEncoder() -> Encoder {
        PyreonJSEncoder(slot: array.append(), codingPath: codingPath)
    }
}

struct PyreonJSSingle: SingleValueEncodingContainer {
    let slot: PyreonJSSlot
    var codingPath: [CodingKey]

    mutating func encodeNil() throws { slot.node = .raw("null") }

    mutating func encode<T: Encodable>(_ value: T) throws {
        try pyreonJSLeaf(value, into: slot, path: codingPath)
    }
}
