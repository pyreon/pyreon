// PyreonI18n behavior — standalone assertion program the co-source verify gate
// compiles with ../swift/PyreonI18n.swift (-parse-as-library) and runs.
// Byte-aligned with PyreonI18nTest.kt + the web createI18n / t() tests.

import Foundation

@main
struct PyreonI18nTests {
    static func eq(_ a: String, _ b: String, _ m: String = "") {
        if a != b { fatalError("PyreonI18nTests: \(m) — \(a) != \(b)") }
    }

    static func main() {
        // single-arg t(): active-locale lookup, fallback chain, key-verbatim miss
        var i18n = PyreonI18n(
            locale: "de",
            messages: ["en": ["hello": "Hello!"], "de": [:]],
            fallbackLocale: "en"
        )
        eq(i18n.t("hello"), "Hello!", "resolves via fallback locale")
        eq(i18n.t("missing"), "missing", "missing key returns verbatim")

        // two-arg t(): {{name}} interpolation with String + Int values
        i18n = PyreonI18n(
            locale: "en",
            messages: ["en": ["greet": "Hello {{name}}, you have {{n}}!"]]
        )
        eq(i18n.t("greet", ["name": "Ada", "n": 3]), "Hello Ada, you have 3!", "interpolation")

        // plurals: count == 1 → _one, else _other; bare key when no suffixed entries
        i18n = PyreonI18n(
            locale: "en",
            messages: ["en": [
                "items_one": "{{count}} item",
                "items_other": "{{count}} items",
                "plain": "no plural {{count}}",
            ]]
        )
        eq(i18n.t("items", ["count": 1]), "1 item", "singular")
        eq(i18n.t("items", ["count": 2]), "2 items", "plural")
        eq(i18n.t("items", ["count": 0]), "0 items", "zero → other")
        eq(i18n.t("plain", ["count": 5]), "no plural 5", "no suffixed entries → bare key")

        print("[PyreonI18nTests] all assertions passed")
    }
}
