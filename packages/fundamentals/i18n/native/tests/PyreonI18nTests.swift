// PyreonI18n behavior — standalone assertion program the co-source verify gate
// compiles with ../swift/PyreonI18n.swift (-parse-as-library) and runs.
// Byte-aligned with PyreonI18nTest.kt + the web createI18n / t() tests.
//
// The `<plural-cases>` block is SHARED with PyreonI18nTest.kt: the i18n
// package's vitest suite (`native-plural-cases.test.ts`) asserts the two
// copies are identical AND that every expected category equals what
// `Intl.PluralRules` returns, so these expectations are real CLDR data.

import Foundation

@main
struct PyreonI18nTests {
    static func eq(_ a: String, _ b: String, _ m: String = "") {
        if a != b { fatalError("PyreonI18nTests: \(m) — \(a) != \(b)") }
    }

    // <plural-cases>
    static let pluralCases: [(String, Double, String)] = [
            ("cs", 0.0, "other"),
            ("cs", 1.0, "one"),
            ("cs", 2.0, "few"),
            ("cs", 3.0, "few"),
            ("cs", 4.0, "few"),
            ("cs", 5.0, "other"),
            ("cs", 1.5, "many"),
            ("cs", 2.0, "few"),
            ("cs", 10.0, "other"),
            ("sk", 1.0, "one"),
            ("sk", 3.0, "few"),
            ("sk", 5.0, "other"),
            ("sk", 0.5, "many"),
            ("pl", 1.0, "one"),
            ("pl", 2.0, "few"),
            ("pl", 4.0, "few"),
            ("pl", 5.0, "many"),
            ("pl", 12.0, "many"),
            ("pl", 14.0, "many"),
            ("pl", 21.0, "many"),
            ("pl", 22.0, "few"),
            ("pl", 25.0, "many"),
            ("pl", 112.0, "many"),
            ("pl", 1.5, "other"),
            ("ru", 0.0, "many"),
            ("ru", 1.0, "one"),
            ("ru", 2.0, "few"),
            ("ru", 5.0, "many"),
            ("ru", 11.0, "many"),
            ("ru", 12.0, "many"),
            ("ru", 21.0, "one"),
            ("ru", 22.0, "few"),
            ("ru", 25.0, "many"),
            ("ru", 111.0, "many"),
            ("ru", 1.5, "other"),
            ("uk", 1.0, "one"),
            ("uk", 3.0, "few"),
            ("uk", 11.0, "many"),
            ("uk", 21.0, "one"),
            ("uk", 0.5, "other"),
            ("ar", 0.0, "zero"),
            ("ar", 1.0, "one"),
            ("ar", 2.0, "two"),
            ("ar", 3.0, "few"),
            ("ar", 10.0, "few"),
            ("ar", 11.0, "many"),
            ("ar", 99.0, "many"),
            ("ar", 100.0, "other"),
            ("ar", 101.0, "other"),
            ("ar", 102.0, "other"),
            ("ar", 103.0, "few"),
            ("ar", 111.0, "many"),
            ("ar", 0.5, "other"),
            ("he", 0.0, "other"),
            ("he", 1.0, "one"),
            ("he", 2.0, "two"),
            ("he", 3.0, "other"),
            ("he", 20.0, "other"),
            ("he", 0.5, "one"),
            ("he", 1.5, "other"),
            ("en", 0.0, "other"),
            ("en", 1.0, "one"),
            ("en", 2.0, "other"),
            ("en", 1.5, "other"),
            ("de", 1.0, "one"),
            ("de", 5.0, "other"),
            ("nl", 1.0, "one"),
            ("nl", 0.5, "other"),
            ("fr", 0.0, "one"),
            ("fr", 1.0, "one"),
            ("fr", 1.5, "one"),
            ("fr", 2.0, "other"),
            ("fr", 1000000.0, "many"),
            ("es", 1.0, "one"),
            ("es", 2.0, "other"),
            ("es", 1000000.0, "many"),
            ("it", 1.0, "one"),
            ("it", 1000000.0, "many"),
            ("it", 2000000.0, "many"),
            ("pt", 0.0, "one"),
            ("pt", 1.0, "one"),
            ("pt", 1.5, "one"),
            ("pt", 2.0, "other"),
            ("pt-PT", 0.0, "other"),
            ("pt-PT", 1.0, "one"),
            ("tr", 1.0, "one"),
            ("tr", 2.0, "other"),
            ("ja", 1.0, "other"),
            ("ja", 2.0, "other"),
            ("zh", 1.0, "other"),
            ("ko", 1.0, "other"),
            ("lt", 1.0, "one"),
            ("lt", 2.0, "few"),
            ("lt", 10.0, "other"),
            ("lt", 11.0, "other"),
            ("lt", 1.5, "many"),
            ("lv", 0.0, "zero"),
            ("lv", 1.0, "one"),
            ("lv", 10.0, "zero"),
            ("lv", 11.0, "zero"),
            ("lv", 21.0, "one"),
            ("ro", 0.0, "few"),
            ("ro", 1.0, "one"),
            ("ro", 2.0, "few"),
            ("ro", 19.0, "few"),
            ("ro", 20.0, "other"),
            ("ro", 101.0, "few"),
            ("ro", 1.5, "few"),
            ("sl", 1.0, "one"),
            ("sl", 2.0, "two"),
            ("sl", 3.0, "few"),
            ("sl", 5.0, "other"),
            ("sl", 101.0, "one"),
            ("sl", 102.0, "two"),
            ("sl", 0.5, "few"),
            ("hr", 1.0, "one"),
            ("hr", 2.0, "few"),
            ("hr", 5.0, "other"),
            ("hr", 11.0, "other"),
            ("hr", 21.0, "one"),
            ("hr", 1.1, "one"),
            ("da", 1.0, "one"),
            ("da", 0.5, "one"),
            ("da", 1.5, "one"),
            ("da", 2.0, "other"),
            ("cs-CZ", 3.0, "few"),
            ("xx", 1.0, "one"),
            ("xx", 1.5, "other"),
            ("xx", 2.0, "other"),
    ]
    // </plural-cases>

    static func main() {
        // single-arg t(): active-locale lookup, fallback chain, key-verbatim miss
        var i18n = PyreonI18n(
            locale: "de",
            messages: ["en": ["hello": "Hello!"], "de": [:]],
            fallbackLocale: "en"
        )
        eq(i18n.t("hello"), "Hello!", "resolves via fallback locale")
        eq(i18n.t("missing"), "missing", "missing key returns verbatim")

        // regional locale steps down to its base language (web localeChain)
        i18n = PyreonI18n(locale: "de-AT", messages: ["de": ["hello": "Hallo!"]])
        eq(i18n.t("hello"), "Hallo!", "de-AT steps down to de")

        // two-arg t(): {{name}} interpolation with String + Int values
        i18n = PyreonI18n(
            locale: "en",
            messages: ["en": ["greet": "Hello {{name}}, you have {{n}}!"]]
        )
        eq(i18n.t("greet", ["name": "Ada", "n": 3]), "Hello Ada, you have 3!", "interpolation")

        // en plurals: one / other; explicit _zero for count == 0; bare key when no suffixed entries
        i18n = PyreonI18n(
            locale: "en",
            messages: ["en": [
                "items_one": "{{count}} item",
                "items_other": "{{count}} items",
                "empty_zero": "nothing",
                "empty_other": "{{count}} things",
                "plain": "no plural {{count}}",
            ]]
        )
        eq(i18n.t("items", ["count": 1]), "1 item", "singular")
        eq(i18n.t("items", ["count": 2]), "2 items", "plural")
        eq(i18n.t("items", ["count": 0]), "0 items", "zero → other (no _zero form)")
        eq(i18n.t("items", ["count": 1.5]), "1.5 items", "en 1.5 → other")
        eq(i18n.t("empty", ["count": 0]), "nothing", "explicit _zero wins at count == 0")
        eq(i18n.t("plain", ["count": 5]), "no plural 5", "no suffixed entries → bare key")

        // CLDR categories beyond one/other — the issue's Czech repro
        let files: [String: [String: String]] = [
            "cs": [
                "files_one": "{{count}} soubor",
                "files_few": "{{count}} soubory",
                "files_many": "{{count}} souboru",
                "files_other": "{{count}} souborů",
            ],
            "en": ["files_one": "{{count}} file", "files_other": "{{count}} files"],
            "ar": ["files_other": "other"],
        ]
        i18n = PyreonI18n(locale: "cs", messages: files)
        eq(i18n.t("files", ["count": 1]), "1 soubor", "cs 1 → one")
        eq(i18n.t("files", ["count": 3]), "3 soubory", "cs 3 → few")
        eq(i18n.t("files", ["count": 1.5]), "1.5 souboru", "cs 1.5 → many")
        eq(i18n.t("files", ["count": 5]), "5 souborů", "cs 5 → other")

        // locale switching — the write the web `i18n.locale.set('en')` lowers to
        i18n.locale = "en"
        eq(i18n.locale, "en", "locale is writable")
        eq(i18n.t("files", ["count": 3]), "3 files", "t() resolves in the new locale")

        // a missing CLDR form falls back to _other before the bare key
        i18n.locale = "ar"
        eq(i18n.t("files", ["count": 3]), "other", "ar few missing → _other")

        // the shared CLDR case table (checked against Intl.PluralRules on the JS side)
        for (locale, count, expected) in pluralCases {
            eq(PyreonPluralRules.select(locale: locale, count: count), expected, "\(locale) \(count)")
        }
        eq(PyreonPluralRules.select(locale: "cs", count: .nan), "other", "NaN → other")

        print("[PyreonI18nTests] all assertions passed")
    }
}
