// PyreonI18n — SwiftUI side of @pyreon/i18n's reactive translation
// surface. Mirrors the web `createI18n` (`@pyreon/i18n/core`) for the
// static-messages subset PMTC lowers:
//
//     const i18n = createI18n({ locale: 'cs', messages: { … }, fallbackLocale: 'en' })
//     i18n.t('hello')                    // lookup along the locale chain
//     i18n.t('files', { count: 3 })      // CLDR plural category + {{count}}
//     i18n.locale()                      // read  → `i18n.locale`
//     i18n.locale.set('pl')              // write → `i18n.locale = "pl"`
//
// ## Plurals
//
// The web side asks `Intl.PluralRules`. Foundation has no public API that
// returns a CLDR plural CATEGORY for a number (the CLDR rules exist inside
// ICU, but they are only reachable through `.stringsdict` / automatic
// grammar agreement, which resolve a whole localized string from a bundle,
// not a category for an app-supplied message table). So this file carries
// the CLDR 48 cardinal rules as DATA — the exact rule strings from CLDR's
// `plurals.xml` — plus a small evaluator for the CLDR rule syntax. The
// Kotlin port carries the byte-identical table, so both targets resolve
// the same category for the same input, and the shared case table in
// `native/tests` is checked against `Intl.PluralRules` by the package's
// vitest suite.
//
// Supported languages: see `PyreonPluralRules.table`. A locale outside it
// resolves with the English-shaped one/other rule (`i = 1 and v = 0`) —
// the same thing the web side does when `Intl.PluralRules` is unavailable.
//
// Operands follow `Intl.PluralRules` defaults: the count is rounded to at
// most 3 fraction digits and trailing zeros are dropped, so `2.0` is an
// integer and `1.5` has one visible fraction digit (Czech `1.5` → `many`).
//
// Out of scope here (web-only today): async namespace loading,
// `addMessages()`, `<Trans>`, `context` variants, custom `pluralRules`.

import Foundation
import Observation

/// Observable reactive-translation container — the SwiftUI half of
/// `createI18n({ locale, messages })`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonI18n {
    /// Currently-active locale. Writable: `i18n.locale.set('pl')` lowers to
    /// `i18n.locale = "pl"`, and every view that called `t()` re-renders
    /// because `t()` reads this property inside the observation scope.
    public var locale: String

    /// Optional fallback locale used when the active locale is missing
    /// a key. Mirrors web `createI18n({ fallbackLocale })`.
    public let fallbackLocale: String?

    /// Frozen translation table — `locale → key → translation`, baked at
    /// PMTC emit time from the literal config.
    public let messages: [String: [String: String]]

    public init(
        locale: String,
        messages: [String: [String: String]],
        fallbackLocale: String? = nil,
    ) {
        self.locale = locale
        self.messages = messages
        self.fallbackLocale = fallbackLocale
    }

    /// The web `localeChain`: the active locale stepped down (`pt-BR` → `pt`),
    /// then the fallback locale stepped down, de-duplicated.
    func localeChain() -> [String] {
        var out: [String] = []
        for tag in [locale] + (fallbackLocale.map { [$0] } ?? []) {
            for step in PyreonI18n.stepDown(tag) where !out.contains(step) { out.append(step) }
        }
        return out
    }

    static func stepDown(_ tag: String) -> [String] {
        var out = [tag]
        var cur = tag
        while let idx = cur.lastIndex(where: { $0 == "-" || $0 == "_" }), idx != cur.startIndex {
            cur = String(cur[cur.startIndex..<idx])
            out.append(cur)
        }
        return out
    }

    private func lookup(_ candidates: [String]) -> String? {
        // Active locale exhausted first, then the fallback — web order.
        for loc in localeChain() {
            for c in candidates {
                if let v = messages[loc]?[c] { return v }
            }
        }
        return nil
    }

    /// `i18n.t("hello")` — look up `key` along the locale chain, returning
    /// the key verbatim on miss.
    public func t(_ key: String) -> String {
        lookup([key]) ?? key
    }

    /// Two-arg `t(key, values)` — interpolation + plurals, mirroring the
    /// web `@pyreon/i18n/core` contract:
    ///
    ///   - `{{name}}` placeholders replace with `values["name"]`.
    ///   - When `values["count"]` is present the candidates are, in order:
    ///     `key_zero` (count == 0 only), `key_<CLDR category>`, then — the
    ///     bare key being the singular form — `key` before `key_other` when the
    ///     category is `one`, and `key_other` before `key` otherwise.
    public func t(_ key: String, _ values: [String: CustomStringConvertible]) -> String {
        var candidates = [key]
        if let countValue = values["count"] {
            let count = Double(countValue.description) ?? .nan
            var suffixes: [String] = []
            if count == 0 { suffixes.append("zero") }
            let category = PyreonPluralRules.select(locale: locale, count: count)
            if !suffixes.contains(category) { suffixes.append(category) }
            candidates = suffixes.map { "\(key)_\($0)" }
            // The bare key IS the singular form: for `one` it beats `_other`.
            candidates += category == "one" ? [key, "\(key)_other"] : (category == "other" ? [key] : ["\(key)_other", key])
        }
        var out = lookup(candidates) ?? key
        for (name, value) in values {
            out = out.replacingOccurrences(of: "{{\(name)}}", with: value.description)
        }
        return out
    }
}

/// CLDR cardinal plural rules as data + an evaluator for the rule syntax.
/// The table is BYTE-IDENTICAL to the Kotlin port's (`PyreonI18n.kt`).
public enum PyreonPluralRules {
    /// `languages` (space-separated) → ordered `(category, CLDR rule)` pairs.
    /// Source: CLDR 48 `common/supplemental/plurals.xml`. `other` is implicit.
    // <cldr-plural-table>
    static let table: [(String, [(String, String)])] = [
        ("ja zh ko th vi id ms", []),
        ("en de nl sv fi et", [("one", "i = 1 and v = 0")]),
        ("it ca", [("one", "i = 1 and v = 0"), ("many", "e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5")]),
        ("es", [("one", "n = 1"), ("many", "e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5")]),
        ("fr", [("one", "i = 0,1"), ("many", "e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5")]),
        ("pt", [("one", "i = 0..1"), ("many", "e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5")]),
        ("pt-pt", [("one", "i = 1 and v = 0"), ("many", "e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5")]),
        ("tr hu el nb no bg", [("one", "n = 1")]),
        ("da", [("one", "n = 1 or t != 0 and i = 0,1")]),
        ("hi", [("one", "i = 0 or n = 1")]),
        ("cs sk", [("one", "i = 1 and v = 0"), ("few", "i = 2..4 and v = 0"), ("many", "v != 0")]),
        ("pl", [("one", "i = 1 and v = 0"), ("few", "v = 0 and i % 10 = 2..4 and i % 100 != 12..14"), ("many", "v = 0 and i != 1 and i % 10 = 0..1 or v = 0 and i % 10 = 5..9 or v = 0 and i % 100 = 12..14")]),
        ("ru uk", [("one", "v = 0 and i % 10 = 1 and i % 100 != 11"), ("few", "v = 0 and i % 10 = 2..4 and i % 100 != 12..14"), ("many", "v = 0 and i % 10 = 0 or v = 0 and i % 10 = 5..9 or v = 0 and i % 100 = 11..14")]),
        ("hr sr bs", [("one", "v = 0 and i % 10 = 1 and i % 100 != 11 or f % 10 = 1 and f % 100 != 11"), ("few", "v = 0 and i % 10 = 2..4 and i % 100 != 12..14 or f % 10 = 2..4 and f % 100 != 12..14")]),
        ("sl", [("one", "v = 0 and i % 100 = 1"), ("two", "v = 0 and i % 100 = 2"), ("few", "v = 0 and i % 100 = 3..4 or v != 0")]),
        ("lt", [("one", "n % 10 = 1 and n % 100 != 11..19"), ("few", "n % 10 = 2..9 and n % 100 != 11..19"), ("many", "f != 0")]),
        ("lv", [("zero", "n % 10 = 0 or n % 100 = 11..19 or v = 2 and f % 100 = 11..19"), ("one", "n % 10 = 1 and n % 100 != 11 or v = 2 and f % 10 = 1 and f % 100 != 11 or v != 2 and f % 10 = 1")]),
        ("ro", [("one", "i = 1 and v = 0"), ("few", "v != 0 or n = 0 or n != 1 and n % 100 = 1..19")]),
        ("he", [("one", "i = 1 and v = 0 or i = 0 and v != 0"), ("two", "i = 2 and v = 0")]),
        ("ar", [("zero", "n = 0"), ("one", "n = 1"), ("two", "n = 2"), ("few", "n % 100 = 3..10"), ("many", "n % 100 = 11..99")]),
    ]
    // </cldr-plural-table>

    /// Used for a locale the table does not cover (English-shaped).
    static let defaultRules: [(String, String)] = [("one", "i = 1 and v = 0")]

    private static let byLanguage: [String: [(String, String)]] = {
        var out: [String: [(String, String)]] = [:]
        for (langs, rules) in table {
            for lang in langs.split(separator: " ") { out[String(lang)] = rules }
        }
        return out
    }()

    /// Rules for a BCP-47 tag: the full tag first (`pt-PT`), then each
    /// step-down (`pt`); unknown → `defaultRules`.
    static func rules(for locale: String) -> [(String, String)] {
        let tag = locale.lowercased().replacingOccurrences(of: "_", with: "-")
        for step in PyreonI18n.stepDown(tag) {
            if let r = byLanguage[step] { return r }
        }
        return defaultRules
    }

    /// The CLDR cardinal category (`zero`/`one`/`two`/`few`/`many`/`other`)
    /// for `count` in `locale`. NaN / infinity → `other`.
    public static func select(locale: String, count: Double) -> String {
        guard count.isFinite else { return "other" }
        let ops = Operands(count)
        for (category, rule) in rules(for: locale) where matches(rule, ops) {
            return category
        }
        return "other"
    }

    /// CLDR operands, computed the way `Intl.PluralRules` formats by default
    /// (absolute value, at most 3 fraction digits, trailing zeros dropped).
    struct Operands {
        let n: Double, i: Double, v: Double, f: Double, t: Double
        init(_ count: Double) {
            // Round the SHORTEST decimal form (`description`) half-up to 3
            // fraction digits — `Intl.PluralRules` rounds the decimal, not the
            // binary value (1.2345 → 1.235, where `1.2345 * 1000` → 1234.4999).
            var source = Decimal(string: "\(abs(count))") ?? Decimal(abs(count))
            var rounded = Decimal()
            NSDecimalRound(&rounded, &source, 3, .plain)
            let text = NSDecimalNumber(decimal: rounded).stringValue
            let parts = text.split(separator: ".", maxSplits: 1)
            var fraction = parts.count > 1 ? String(parts[1]) : ""
            while fraction.hasSuffix("0") { fraction.removeLast() }
            i = Double(parts.first.map(String.init) ?? "0") ?? 0
            v = Double(fraction.count)
            f = Double(fraction) ?? 0
            t = f
            n = Double(fraction.isEmpty ? String(parts[0]) : "\(parts[0]).\(fraction)") ?? abs(count)
        }
        func value(_ op: Character) -> Double {
            switch op {
            case "n": return n
            case "i": return i
            case "v", "w": return v
            case "f": return f
            case "t": return t
            default: return 0 // c / e (compact exponent) — always 0 for a plain count
            }
        }
    }

    static func matches(_ rule: String, _ ops: Operands) -> Bool {
        for orPart in rule.components(separatedBy: " or ") {
            var all = true
            for relation in orPart.components(separatedBy: " and ") where !relationHolds(relation, ops) {
                all = false
                break
            }
            if all { return true }
        }
        return false
    }

    private static func relationHolds(_ relation: String, _ ops: Operands) -> Bool {
        let negate = relation.contains("!=")
        let sides = relation.components(separatedBy: negate ? "!=" : "=")
        guard sides.count == 2 else { return false }
        let lhs = sides[0].trimmingCharacters(in: .whitespaces)
        guard let op = lhs.first else { return false }
        var value = ops.value(op)
        if let pct = lhs.firstIndex(of: "%"),
           let mod = Double(lhs[lhs.index(after: pct)...].trimmingCharacters(in: .whitespaces)) {
            value = value.truncatingRemainder(dividingBy: mod)
        }
        var inList = false
        for item in sides[1].trimmingCharacters(in: .whitespaces).components(separatedBy: ",") {
            let bounds = item.components(separatedBy: "..")
            guard let lo = Double(bounds[0]), let hi = Double(bounds.count > 1 ? bounds[1] : bounds[0]) else { continue }
            // A range matches integers only; a single value matches by equality.
            if bounds.count > 1 ? (value == value.rounded() && value >= lo && value <= hi) : value == lo {
                inList = true
                break
            }
        }
        return negate ? !inList : inList
    }
}
