// PyreonI18n — Compose side of @pyreon/i18n's reactive translation
// surface. Mirrors the Swift `PyreonI18n` one-for-one (Strategy-B v1,
// Gap 4 PR-3): static messages + locale-aware lookup + key fallback.
//
// Web shape:
//     val i18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hi' } } })
//     i18n.t("hello")              // 'Hi'
//
// Scope (v1): single-argument `t(key)` lookup; locale writes,
// interpolation values, pluralization, namespaces, async loading are
// deferred follow-ups.

package com.pyreon.runtime

import androidx.compose.runtime.mutableStateOf

class PyreonI18n(
    initialLocale: String,
    val messages: Map<String, Map<String, String>>,
    val fallbackLocale: String? = null,
) {
    private val _locale = mutableStateOf(initialLocale)

    /** Currently-active locale. Read-only in v1. */
    val locale: String get() = _locale.value

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
}
