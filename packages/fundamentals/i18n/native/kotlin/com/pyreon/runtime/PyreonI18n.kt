// PyreonI18n — Compose side of @pyreon/i18n's reactive translation
// surface. Mirrors the Swift `PyreonI18n` one-for-one (Strategy-B v1,
// Gap 4 PR-3): static messages + locale-aware lookup + key fallback.
//
// Web shape:
//     val i18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hi' } } })
//     i18n.t("hello")              // 'Hi'
//
// Supported: `t(key)` with fallback locale, `t(key, values)` with
// `{{name}}` interpolation and one/other plurals, and switching the
// active locale (`i18n.locale.set('de')` on the web lowers to an
// assignment to `locale`; reads recompose because it is Compose state).
// Not supported: the full CLDR plural categories (zero/few/many), async
// namespace loading, `<Trans>`, `addMessages()`.

package com.pyreon.runtime

import androidx.compose.runtime.mutableStateOf

class PyreonI18n(
    initialLocale: String,
    val messages: Map<String, Map<String, String>>,
    val fallbackLocale: String? = null,
) {
    private val _locale = mutableStateOf(initialLocale)

    /**
     * Currently-active locale. Settable: `i18n.locale.set("de")` on the web
     * lowers to `i18n.locale = "de"`, and every composable reading `t(...)`
     * recomposes because the value is Compose state.
     */
    var locale: String
        get() = _locale.value
        set(value) {
            _locale.value = value
        }

    /**
     * `i18n.t("hello")` — look up the translation for `key` in the
     * active locale, falling back to `fallbackLocale` (if set), then
     * returning the key verbatim on miss. Matches the Swift
     * `PyreonI18n.t(_:)` contract one-for-one.
     */
    fun t(key: String): String {
        messages[_locale.value]?.get(key)?.let { return it }
        if (fallbackLocale != null) {
            messages[fallbackLocale]?.get(key)?.let { return it }
        }
        return key
    }

    /**
     * Two-arg `t(key, values)` — interpolation + plurals, mirroring the
     * web `@pyreon/i18n/core` contract (and the Swift port's overload):
     *
     *  - `{{name}}` placeholders replace with `values["name"]`
     *    (stringified — String + Int both flow).
     *  - When `values["count"]` is present, the plural-suffixed key is
     *    tried FIRST: `key_one` when count == 1, else `key_other`,
     *    falling back to the bare key. v1 ships the one/other pair
     *    (en-style cardinal rules); the full Intl.PluralRules category
     *    set (few/many/zero) is not supported.
     *
     * PMTC emits `t('items', { count: n() })` as
     * `t("items", mapOf("count" to n))` — the object-literal argument
     * lowers to a map at this call shape.
     */
    fun t(key: String, values: Map<String, Any?>): String {
        var resolvedKey = key
        val count = values["count"]?.toString()?.toIntOrNull()
        if (count != null) {
            val suffixed = if (count == 1) "${key}_one" else "${key}_other"
            val exists = messages[_locale.value]?.containsKey(suffixed) == true ||
                (fallbackLocale != null && messages[fallbackLocale]?.containsKey(suffixed) == true)
            if (exists) resolvedKey = suffixed
        }
        var out = t(resolvedKey)
        for ((name, value) in values) {
            out = out.replace("{{${name}}}", value?.toString() ?: "")
        }
        return out
    }
}
