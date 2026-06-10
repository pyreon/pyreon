// Smoke tests for PyreonI18n — createI18n + t() lookup, two-arg
// interpolation, and one/other plural resolution. Dependency-free
// `check(...)` harness; runs via `verify-kotlin.ts --service=PyreonI18n`.
// Mirror of the Swift suite's testPyreonI18n* cases.

package com.pyreon.runtime

fun testI18nLookup() {
    val i18n = PyreonI18n(
        initialLocale = "de",
        messages = mapOf("en" to mapOf("hello" to "Hello!"), "de" to mapOf()),
        fallbackLocale = "en",
    )
    check(i18n.t("hello") == "Hello!") { "fallback-locale chain resolves" }
    check(i18n.t("missing") == "missing") { "miss returns the key verbatim" }
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
                "plain" to "no plural {{count}}",
            ),
        ),
    )
    check(i18n.t("items", mapOf("count" to 1)) == "1 item") { "count==1 resolves _one" }
    check(i18n.t("items", mapOf("count" to 2)) == "2 items") { "count!=1 resolves _other" }
    check(i18n.t("items", mapOf("count" to 0)) == "0 items") { "count==0 resolves _other" }
    check(i18n.t("plain", mapOf("count" to 5)) == "no plural 5") {
        "bare key when no suffixed entries exist"
    }
}

fun main() {
    testI18nLookup()
    testI18nInterpolation()
    testI18nPlurals()
    println("PyreonI18nTest: all checks passed")
}
