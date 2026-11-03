// Smoke tests for PyreonI18n — createI18n + t() lookup, two-arg
// interpolation, CLDR plural resolution and locale switching.
// Dependency-free `check(...)` harness; runs via `verify-kotlin.ts --service=PyreonI18n`.
// Mirror of the Swift suite (PyreonI18nTests.swift).
//
// The `<plural-cases>` block is SHARED with the Swift suite: the i18n
// package's vitest suite (`native-plural-cases.test.ts`) asserts the two
// copies are identical AND match `Intl.PluralRules`.

package com.pyreon.runtime

// <plural-cases>
val pluralCases: List<Triple<String, Double, String>> = listOf(
    Triple("cs", 0.0, "other"),
    Triple("cs", 1.0, "one"),
    Triple("cs", 2.0, "few"),
    Triple("cs", 3.0, "few"),
    Triple("cs", 4.0, "few"),
    Triple("cs", 5.0, "other"),
    Triple("cs", 1.5, "many"),
    Triple("cs", 2.0, "few"),
    Triple("cs", 10.0, "other"),
    Triple("sk", 1.0, "one"),
    Triple("sk", 3.0, "few"),
    Triple("sk", 5.0, "other"),
    Triple("sk", 0.5, "many"),
    Triple("pl", 1.0, "one"),
    Triple("pl", 2.0, "few"),
    Triple("pl", 4.0, "few"),
    Triple("pl", 5.0, "many"),
    Triple("pl", 12.0, "many"),
    Triple("pl", 14.0, "many"),
    Triple("pl", 21.0, "many"),
    Triple("pl", 22.0, "few"),
    Triple("pl", 25.0, "many"),
    Triple("pl", 112.0, "many"),
    Triple("pl", 1.5, "other"),
    Triple("ru", 0.0, "many"),
    Triple("ru", 1.0, "one"),
    Triple("ru", 2.0, "few"),
    Triple("ru", 5.0, "many"),
    Triple("ru", 11.0, "many"),
    Triple("ru", 12.0, "many"),
    Triple("ru", 21.0, "one"),
    Triple("ru", 22.0, "few"),
    Triple("ru", 25.0, "many"),
    Triple("ru", 111.0, "many"),
    Triple("ru", 1.5, "other"),
    Triple("uk", 1.0, "one"),
    Triple("uk", 3.0, "few"),
    Triple("uk", 11.0, "many"),
    Triple("uk", 21.0, "one"),
    Triple("uk", 0.5, "other"),
    Triple("ar", 0.0, "zero"),
    Triple("ar", 1.0, "one"),
    Triple("ar", 2.0, "two"),
    Triple("ar", 3.0, "few"),
    Triple("ar", 10.0, "few"),
    Triple("ar", 11.0, "many"),
    Triple("ar", 99.0, "many"),
    Triple("ar", 100.0, "other"),
    Triple("ar", 101.0, "other"),
    Triple("ar", 102.0, "other"),
    Triple("ar", 103.0, "few"),
    Triple("ar", 111.0, "many"),
    Triple("ar", 0.5, "other"),
    Triple("he", 0.0, "other"),
    Triple("he", 1.0, "one"),
    Triple("he", 2.0, "two"),
    Triple("he", 3.0, "other"),
    Triple("he", 20.0, "other"),
    Triple("he", 0.5, "one"),
    Triple("he", 1.5, "other"),
    Triple("en", 0.0, "other"),
    Triple("en", 1.0, "one"),
    Triple("en", 2.0, "other"),
    Triple("en", 1.5, "other"),
    Triple("de", 1.0, "one"),
    Triple("de", 5.0, "other"),
    Triple("nl", 1.0, "one"),
    Triple("nl", 0.5, "other"),
    Triple("fr", 0.0, "one"),
    Triple("fr", 1.0, "one"),
    Triple("fr", 1.5, "one"),
    Triple("fr", 2.0, "other"),
    Triple("fr", 1000000.0, "many"),
    Triple("es", 1.0, "one"),
    Triple("es", 2.0, "other"),
    Triple("es", 1000000.0, "many"),
    Triple("it", 1.0, "one"),
    Triple("it", 1000000.0, "many"),
    Triple("it", 2000000.0, "many"),
    Triple("pt", 0.0, "one"),
    Triple("pt", 1.0, "one"),
    Triple("pt", 1.5, "one"),
    Triple("pt", 2.0, "other"),
    Triple("pt-PT", 0.0, "other"),
    Triple("pt-PT", 1.0, "one"),
    Triple("tr", 1.0, "one"),
    Triple("tr", 2.0, "other"),
    Triple("ja", 1.0, "other"),
    Triple("ja", 2.0, "other"),
    Triple("zh", 1.0, "other"),
    Triple("ko", 1.0, "other"),
    Triple("lt", 1.0, "one"),
    Triple("lt", 2.0, "few"),
    Triple("lt", 10.0, "other"),
    Triple("lt", 11.0, "other"),
    Triple("lt", 1.5, "many"),
    Triple("lv", 0.0, "zero"),
    Triple("lv", 1.0, "one"),
    Triple("lv", 10.0, "zero"),
    Triple("lv", 11.0, "zero"),
    Triple("lv", 21.0, "one"),
    Triple("ro", 0.0, "few"),
    Triple("ro", 1.0, "one"),
    Triple("ro", 2.0, "few"),
    Triple("ro", 19.0, "few"),
    Triple("ro", 20.0, "other"),
    Triple("ro", 101.0, "few"),
    Triple("ro", 1.5, "few"),
    Triple("sl", 1.0, "one"),
    Triple("sl", 2.0, "two"),
    Triple("sl", 3.0, "few"),
    Triple("sl", 5.0, "other"),
    Triple("sl", 101.0, "one"),
    Triple("sl", 102.0, "two"),
    Triple("sl", 0.5, "few"),
    Triple("hr", 1.0, "one"),
    Triple("hr", 2.0, "few"),
    Triple("hr", 5.0, "other"),
    Triple("hr", 11.0, "other"),
    Triple("hr", 21.0, "one"),
    Triple("hr", 1.1, "one"),
    Triple("da", 1.0, "one"),
    Triple("da", 0.5, "one"),
    Triple("da", 1.5, "one"),
    Triple("da", 2.0, "other"),
    Triple("cs-CZ", 3.0, "few"),
    Triple("xx", 1.0, "one"),
    Triple("xx", 1.5, "other"),
    Triple("xx", 2.0, "other"),
)
// </plural-cases>

fun testI18nLookup() {
    val i18n = PyreonI18n(
        initialLocale = "de",
        messages = mapOf("en" to mapOf("hello" to "Hello!"), "de" to mapOf()),
        fallbackLocale = "en",
    )
    check(i18n.t("hello") == "Hello!") { "fallback-locale chain resolves" }
    check(i18n.t("missing") == "missing") { "miss returns the key verbatim" }
    val regional = PyreonI18n(initialLocale = "de-AT", messages = mapOf("de" to mapOf("hello" to "Hallo!")))
    check(regional.t("hello") == "Hallo!") { "de-AT steps down to de" }
}

fun testI18nInterpolation() {
    val i18n = PyreonI18n(
        initialLocale = "en",
        messages = mapOf("en" to mapOf("greet" to "Hello {{name}}, you have {{n}}!")),
    )
    check(i18n.t("greet", mapOf("name" to "Ada", "n" to 3)) == "Hello Ada, you have 3!") {
        "{{name}} placeholders replace with stringified values"
    }
}

fun testI18nPlurals() {
    val i18n = PyreonI18n(
        initialLocale = "en",
        messages = mapOf(
            "en" to mapOf(
                "items_one" to "{{count}} item",
                "items_other" to "{{count}} items",
                "empty_zero" to "nothing",
                "empty_other" to "{{count}} things",
                "plain" to "no plural {{count}}",
            ),
        ),
    )
    check(i18n.t("items", mapOf("count" to 1)) == "1 item") { "count==1 resolves _one" }
    check(i18n.t("items", mapOf("count" to 2)) == "2 items") { "count!=1 resolves _other" }
    check(i18n.t("items", mapOf("count" to 0)) == "0 items") { "count==0 resolves _other" }
    check(i18n.t("items", mapOf("count" to 1.5)) == "1.5 items") { "en 1.5 resolves _other" }
    check(i18n.t("items", mapOf("count" to 1L)) == "1 item") { "a Long count (the PMTC emit) resolves" }
    check(i18n.t("empty", mapOf("count" to 0)) == "nothing") { "explicit _zero wins at count == 0" }
    check(i18n.t("plain", mapOf("count" to 5)) == "no plural 5") {
        "bare key when no suffixed entries exist"
    }
}

fun testI18nCldrAndLocaleSwitch() {
    val i18n = PyreonI18n(
        initialLocale = "cs",
        messages = mapOf(
            "cs" to mapOf(
                "files_one" to "{{count}} soubor",
                "files_few" to "{{count}} soubory",
                "files_many" to "{{count}} souboru",
                "files_other" to "{{count}} souborů",
            ),
            "en" to mapOf("files_one" to "{{count}} file", "files_other" to "{{count}} files"),
            "ar" to mapOf("files_other" to "other"),
        ),
    )
    check(i18n.t("files", mapOf("count" to 1)) == "1 soubor") { "cs 1 -> one" }
    check(i18n.t("files", mapOf("count" to 3)) == "3 soubory") { "cs 3 -> few" }
    check(i18n.t("files", mapOf("count" to 1.5)) == "1.5 souboru") { "cs 1.5 -> many" }
    check(i18n.t("files", mapOf("count" to 5)) == "5 souborů") { "cs 5 -> other" }
    i18n.locale = "en"
    check(i18n.locale == "en") { "locale is writable" }
    check(i18n.t("files", mapOf("count" to 3)) == "3 files") { "t() resolves in the new locale" }
    i18n.locale = "ar"
    check(i18n.t("files", mapOf("count" to 3)) == "other") { "ar few missing -> _other" }
}

// The BARE key is the singular (`one`) form; `_other` only beats it for a
// non-`one` category — same order as the web createI18n.
fun testI18nBareKeyIsSingular() {
    val i18n = PyreonI18n(
        initialLocale = "en",
        messages = mapOf(
            "en" to mapOf("item" to "{{count}} item", "item_other" to "{{count}} items", "lone_other" to "{{count}} lones"),
            "fr" to mapOf("item" to "{{count}} item", "item_other" to "{{count}} items"),
            "cs" to mapOf("file" to "{{count}} soubor", "file_other" to "{{count}} souborů"),
        ),
    )
    check(i18n.t("item", mapOf("count" to 1)) == "1 item") { "en 1 -> bare singular, not _other" }
    check(i18n.t("item", mapOf("count" to 2)) == "2 items") { "en 2 -> _other" }
    check(i18n.t("lone", mapOf("count" to 1)) == "1 lones") { "one with no singular form -> _other last resort" }
    i18n.locale = "fr"
    check(i18n.t("item", mapOf("count" to 0)) == "0 item") { "fr 0 (CLDR one) -> bare singular" }
    i18n.locale = "cs"
    check(i18n.t("file", mapOf("count" to 1)) == "1 soubor") { "cs 1 -> bare singular" }
    check(i18n.t("file", mapOf("count" to 3)) == "3 souborů") { "cs few missing -> _other before the bare singular" }
}

fun testPluralCaseTable() {
    for ((locale, count, expected) in pluralCases) {
        val got = PyreonPluralRules.select(locale, count)
        check(got == expected) { "$locale $count: expected $expected, got $got" }
    }
    check(PyreonPluralRules.select("cs", Double.NaN) == "other") { "NaN -> other" }
}

fun main() {
    testI18nLookup()
    testI18nInterpolation()
    testI18nPlurals()
    testI18nCldrAndLocaleSwitch()
    testI18nBareKeyIsSingular()
    testPluralCaseTable()
    println("PyreonI18nTest: all checks passed")
}
