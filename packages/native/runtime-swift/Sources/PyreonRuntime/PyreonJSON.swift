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
// `undefined`, whereas a JS `null` writes `"k":null`), and a plain `Dictionary`
// keeps Swift's unordered iteration. Emitted code never hands it one: a `Map` /
// `Record` is a `PyreonMap`, which encodes its keys in insertion order.

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

    /**
     * What `JSON.parse(text)` lowers to when the source names the result type (`JSON.parse(s) as T`,
     * `const x: T = JSON.parse(s)`, a typed helper's `return`). Unknown keys are ignored, as on the web.
     *
     * Stricter than the web by construction: a native value has a static type, so input whose SHAPE does not
     * match `T` throws here, where `JSON.parse` would have returned it and failed later at the first read. Both
     * a syntax error and a shape mismatch throw a ``PyreonJSONParseError``.
     */
    public static func parse<T: Decodable>(_ type: T.Type, _ text: String) throws -> T {
        do {
            return try decode(T.self, from: Data(text.utf8))
        } catch let DecodingError.dataCorrupted(context) {
            throw PyreonJSONParseError(message: pyreonJSONDetail(context, fallback: "Unexpected token in JSON"))
        } catch let DecodingError.keyNotFound(key, context) {
            throw PyreonJSONParseError(message: "Missing key \"\(pyreonJSONPath(context.codingPath + [key]))\" in JSON")
        } catch let DecodingError.typeMismatch(_, context) {
            throw PyreonJSONParseError(message: pyreonJSONDetail(context, fallback: "Unexpected value in JSON"))
        } catch let DecodingError.valueNotFound(_, context) {
            throw PyreonJSONParseError(message: pyreonJSONDetail(context, fallback: "Unexpected null in JSON"))
        }
    }

    /**
     * Decode JSON the way every emitted decode site does (`JSON.parse`, a fetch / query / stream body): a
     * `JSONDecoder` that also knows each object's KEY ORDER in the text.
     *
     * The web's `JSON.parse` keeps an object's keys in document order, so a `Record` read from a response iterates
     * (`Object.keys`, `<For>`, `JSON.stringify`) in the order the server wrote. `JSONDecoder` does not: a keyed
     * container's `allKeys` follows its internal dictionary, whose order is a per-process hash. The ordered
     * `PyreonMap` therefore asks the decoder, through `userInfo`, for the keys of the object at its coding path —
     * read from the text on the first such request, never for a payload without a map.
     */
    public static func decoder(for data: Data) -> JSONDecoder {
        let d = JSONDecoder()
        let order = PyreonJSONKeyOrder(data)
        let lookup: ([CodingKey]) -> [String]? = { order.keys(at: $0) }
        d.userInfo[pyreonJSONKeyOrderInfo] = lookup
        return d
    }

    public static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        try decoder(for: data).decode(T.self, from: data)
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

/** The error a lowered `JSON.parse` throws. `message` is the bare text, `description` reads as `String(e)` does on the web. */
public struct PyreonJSONParseError: Error, LocalizedError, CustomStringConvertible {
    public let message: String
    public init(message: String) { self.message = message }
    public var errorDescription: String? { message }
    public var description: String { "SyntaxError: \(message)" }
}

private func pyreonJSONPath(_ path: [CodingKey]) -> String {
    path.map { $0.intValue.map(String.init) ?? $0.stringValue }.joined(separator: ".")
}

private func pyreonJSONDetail(_ context: DecodingError.Context, fallback: String) -> String {
    context.codingPath.isEmpty ? fallback : "\(fallback) at \"\(pyreonJSONPath(context.codingPath))\""
}

/// The `userInfo` key under which ``PyreonJSON/decoder(for:)`` publishes `([CodingKey]) -> [String]?`: the keys of
/// the JSON object at a coding path, in document order. Spelled by raw value in `PyreonCollections.swift` too, so
/// neither file needs the other to compile.
let pyreonJSONKeyOrderInfo = CodingUserInfoKey(rawValue: "pyreon.jsonKeyOrder")!

/// Every object's keys in document order, indexed by coding path; built on the first lookup.
final class PyreonJSONKeyOrder {
    private let bytes: [UInt8]
    private var index: [String: [String]]?
    private var i = 0

    init(_ data: Data) { bytes = [UInt8](data) }

    func keys(at path: [CodingKey]) -> [String]? {
        if index == nil {
            index = [:]
            i = 0
            scanValue(path: "")
        }
        return index?[PyreonJSONKeyOrder.pathKey(path)]
    }

    /// A coding path as the scanner spells it: `[3]` for an array element, `.name` (escaped) for an object member.
    static func pathKey(_ path: [CodingKey]) -> String {
        var s = ""
        for k in path { s += component(k.intValue, k.stringValue) }
        return s
    }

    private static func component(_ index: Int?, _ key: String) -> String {
        if let index { return "[\(index)]" }
        return "." + key.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: ".", with: "\\.").replacingOccurrences(of: "[", with: "\\[")
    }

    private func skipSpace() {
        while i < bytes.count, bytes[i] == 0x20 || bytes[i] == 0x0A || bytes[i] == 0x0D || bytes[i] == 0x09 { i += 1 }
    }

    /// Malformed input stops the scan; `JSONDecoder` reports the syntax error itself.
    private func scanValue(path: String) {
        skipSpace()
        guard i < bytes.count else { return }
        switch bytes[i] {
        case 0x7B: // {
            i += 1
            var keys: [String] = []
            skipSpace()
            if i < bytes.count, bytes[i] == 0x7D { i += 1; index?[path] = keys; return }
            while i < bytes.count {
                skipSpace()
                guard i < bytes.count, bytes[i] == 0x22, let key = scanString() else { return }
                // A repeated key keeps its FIRST position (the value is the decoder's: the last one).
                if !keys.contains(key) { keys.append(key) }
                skipSpace()
                guard i < bytes.count, bytes[i] == 0x3A else { return }
                i += 1
                scanValue(path: path + PyreonJSONKeyOrder.component(nil, key))
                skipSpace()
                guard i < bytes.count else { return }
                if bytes[i] == 0x2C { i += 1; continue }
                if bytes[i] == 0x7D { i += 1; break }
                return
            }
            index?[path] = keys
        case 0x5B: // [
            i += 1
            var n = 0
            skipSpace()
            if i < bytes.count, bytes[i] == 0x5D { i += 1; return }
            while i < bytes.count {
                scanValue(path: path + PyreonJSONKeyOrder.component(n, ""))
                n += 1
                skipSpace()
                guard i < bytes.count else { return }
                if bytes[i] == 0x2C { i += 1; continue }
                if bytes[i] == 0x5D { i += 1; return }
                return
            }
        case 0x22:
            _ = scanString()
        default:
            while i < bytes.count, ![0x2C, 0x7D, 0x5D, 0x20, 0x0A, 0x0D, 0x09].contains(bytes[i]) { i += 1 }
        }
    }

    /// A JSON string at `i` (on its opening quote), unescaped; `nil` when it is unterminated.
    private func scanString() -> String? {
        i += 1
        var out: [UInt16] = []
        var raw: [UInt8] = []
        func flush() {
            if !raw.isEmpty { out.append(contentsOf: String(decoding: raw, as: UTF8.self).utf16); raw.removeAll() }
        }
        while i < bytes.count {
            let b = bytes[i]
            if b == 0x22 { i += 1; flush(); return String(decoding: out, as: UTF16.self) }
            if b == 0x5C {
                flush()
                guard i + 1 < bytes.count else { return nil }
                let e = bytes[i + 1]
                i += 2
                switch e {
                case 0x62: out.append(0x08)
                case 0x66: out.append(0x0C)
                case 0x6E: out.append(0x0A)
                case 0x72: out.append(0x0D)
                case 0x74: out.append(0x09)
                case 0x75:
                    guard i + 4 <= bytes.count, let u = UInt16(String(decoding: bytes[i..<i + 4], as: UTF8.self), radix: 16) else { return nil }
                    out.append(u)
                    i += 4
                default: out.append(UInt16(e))
                }
                continue
            }
            raw.append(b)
            i += 1
        }
        return nil
    }
}
