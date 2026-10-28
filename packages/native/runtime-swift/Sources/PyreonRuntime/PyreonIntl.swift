import Foundation

// `Intl.DateTimeFormat` / `Intl.NumberFormat` (and the `toLocale*String`
// shapes) as the compiler lowers them — see
// `packages/native/compiler/src/intl-plugin.ts` for what lowers and
// `intl-options.ts` for how the ECMA-402 options become these parameters.
//
// The contract is the WEB's output. Two things make that reachable:
//
// - Component options arrive as the ICU SKELETON V8 builds from them, and
//   Foundation's `dateFormat(fromTemplate:)` is the same ICU
//   DateTimePatternGenerator V8 asks. What remains is CLDR DATA: Apple ships
//   its own (the same data Safari's `Intl` reads on this device), V8 ships
//   another. `intl-differential.test.ts` measures the difference.
// - The two adjustments V8 makes that Foundation does not are made here: the
//   hour field width follows the requested width (ICU's
//   `UDATPG_MATCH_HOUR_FIELD_LENGTH`, which V8 passes and Apple's template API
//   does not), and U+202F NARROW NO-BREAK SPACE becomes a plain space, which V8
//   does to every date it formats for web compatibility.
//
// Formatters are cached by configuration, because the emit constructs one
// inline (`n.toLocaleString()` in a row of a list) and in SwiftUI `body`, which
// re-runs on every state change. The cache is BOUNDED (`cacheLimit`, oldest
// evicted first) — an app that formats with a runtime locale or time zone
// would otherwise grow it without end.

private final class PyreonIntlCache<Value> {
    private var entries: [String: Value] = [:]
    private var order: [String] = []
    private let lock = NSLock()
    let limit: Int

    init(limit: Int) { self.limit = limit }

    func value(for key: String, make: () -> Value) -> Value {
        lock.lock()
        defer { lock.unlock() }
        if let hit = entries[key] { return hit }
        let made = make()
        entries[key] = made
        order.append(key)
        if order.count > limit {
            entries.removeValue(forKey: order.removeFirst())
        }
        return made
    }

    var count: Int {
        lock.lock()
        defer { lock.unlock() }
        return entries.count
    }
}

/// How many distinct formatter configurations are kept per kind.
public let pyreonIntlCacheLimit = 64

private let dateFormatterCache = PyreonIntlCache<DateFormatter>(limit: pyreonIntlCacheLimit)
private let numberFormatterCache = PyreonIntlCache<NumberFormatter>(limit: pyreonIntlCacheLimit)

/// Test hook: the number of cached formatters of each kind.
public func _pyreonIntlCacheCounts() -> (date: Int, number: Int) {
    (dateFormatterCache.count, numberFormatterCache.count)
}

private func pyreonDateStyle(_ s: String?) -> DateFormatter.Style {
    switch s {
    case "full": return .full
    case "long": return .long
    case "medium": return .medium
    case "short": return .short
    default: return .none
    }
}

/// Rewrite every hour field of `pattern` (outside quoted literals) to `width`
/// letters — ICU's `UDATPG_MATCH_HOUR_FIELD_LENGTH`. Without it `hour:
/// "numeric"` reads `01:00` in German, where the web reads `1:00`.
func pyreonMatchHourWidth(_ pattern: String, width: Int) -> String {
    var out = ""
    var inQuote = false
    let chars = Array(pattern)
    var i = 0
    while i < chars.count {
        let c = chars[i]
        if c == "'" {
            inQuote.toggle()
            out.append(c)
            i += 1
            continue
        }
        if !inQuote && "hHkK".contains(c) {
            var j = i
            while j < chars.count && chars[j] == c { j += 1 }
            out += String(repeating: c, count: width)
            i = j
            continue
        }
        out.append(c)
        i += 1
    }
    return out
}

/// `new Intl.DateTimeFormat(locale, options)`.
public final class PyreonDateTimeFormat {
    private let formatter: DateFormatter

    /// - Parameters:
    ///   - locale: a BCP 47 tag; `nil` is the device locale, as `undefined` is on the web.
    ///   - dateStyle/timeStyle: `"full"` / `"long"` / `"medium"` / `"short"`.
    ///   - skeleton: the ICU skeleton for component options (`"yMMMd"`), mutually
    ///     exclusive with the styles exactly as in ECMA-402.
    ///   - timeZone: an IANA name; `nil` (or a name the platform does not know)
    ///     is the device time zone.
    public init(
        locale: String? = nil,
        dateStyle: String? = nil,
        timeStyle: String? = nil,
        skeleton: String? = nil,
        timeZone: String? = nil
    ) {
        let key = [locale ?? "", dateStyle ?? "", timeStyle ?? "", skeleton ?? "", timeZone ?? ""].joined(separator: "\u{1F}")
        formatter = dateFormatterCache.value(for: key) {
            let f = DateFormatter()
            let loc = locale.map { Locale(identifier: $0) } ?? Locale.current
            f.locale = loc
            if let tz = timeZone.flatMap({ TimeZone(identifier: $0) }) {
                f.timeZone = tz
            }
            if let skeleton {
                var pattern = DateFormatter.dateFormat(fromTemplate: skeleton, options: 0, locale: loc) ?? skeleton
                let hours = skeleton.filter { "jhHkK".contains($0) }.count
                if hours > 0 { pattern = pyreonMatchHourWidth(pattern, width: hours) }
                f.dateFormat = pattern
            } else {
                f.dateStyle = pyreonDateStyle(dateStyle)
                f.timeStyle = pyreonDateStyle(timeStyle)
            }
            return f
        }
    }

    /// Format epoch milliseconds — what `Date.now()`, `new Date(ms)` and a
    /// number signal all are natively. A non-finite value is JavaScript's
    /// `Invalid Date` (where `format` throws a RangeError on the web).
    public func format(_ epochMs: Double) -> String {
        guard epochMs.isFinite else { return "Invalid Date" }
        let s = formatter.string(from: Date(timeIntervalSince1970: epochMs / 1000))
        return s.replacingOccurrences(of: "\u{202F}", with: " ")
    }

    public func format(_ epochMs: Int) -> String { format(Double(epochMs)) }
}

/// `new Intl.NumberFormat(locale, options)` and `n.toLocaleString(locale, options)`.
public final class PyreonNumberFormat {
    private let formatter: NumberFormatter

    public init(
        locale: String? = nil,
        style: String = "decimal",
        currency: String? = nil,
        currencyDisplay: String = "symbol",
        minimumFractionDigits: Int? = nil,
        maximumFractionDigits: Int? = nil,
        minimumIntegerDigits: Int? = nil,
        useGrouping: Bool = true
    ) {
        let key = [
            locale ?? "", style, currency ?? "", currencyDisplay,
            minimumFractionDigits.map(String.init) ?? "", maximumFractionDigits.map(String.init) ?? "",
            minimumIntegerDigits.map(String.init) ?? "", useGrouping ? "1" : "0",
        ].joined(separator: "\u{1F}")
        formatter = numberFormatterCache.value(for: key) {
            let f = NumberFormatter()
            f.locale = locale.map { Locale(identifier: $0) } ?? Locale.current
            switch style {
            case "currency":
                switch currencyDisplay {
                case "code": f.numberStyle = .currencyISOCode
                case "name": f.numberStyle = .currencyPlural
                default: f.numberStyle = .currency
                }
                if let currency { f.currencyCode = currency }
            case "percent":
                f.numberStyle = .percent
            default:
                f.numberStyle = .decimal
            }
            // ECMA-402 rounds half away from zero ("half-expand"); Foundation
            // defaults to banker's rounding, so 2.5 read "2" where the web says "3".
            f.roundingMode = .halfUp
            // ECMA-402's digit defaults: a minimum alone raises the default
            // maximum to meet it, a maximum alone lowers the default minimum.
            let defaultMin = f.minimumFractionDigits
            let defaultMax = f.maximumFractionDigits
            switch (minimumFractionDigits, maximumFractionDigits) {
            case let (min?, max?):
                f.minimumFractionDigits = Swift.min(min, max)
                f.maximumFractionDigits = max
            case let (min?, nil):
                f.minimumFractionDigits = min
                f.maximumFractionDigits = Swift.max(min, defaultMax)
            case let (nil, max?):
                f.minimumFractionDigits = Swift.min(defaultMin, max)
                f.maximumFractionDigits = max
            case (nil, nil):
                break
            }
            if let minimumIntegerDigits { f.minimumIntegerDigits = minimumIntegerDigits }
            f.usesGroupingSeparator = useGrouping
            return f
        }
    }

    public func format(_ value: Double) -> String {
        if value.isNaN { return "NaN" }
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    public func format(_ value: Int) -> String { format(Double(value)) }
}
