// PyreonI18n — SwiftUI side of @pyreon/i18n's reactive translation
// surface. Mirrors the Strategy-B v1 scope (Gap 4 PR-3): static
// messages + locale-aware lookup + key-fallback.
//
// Web shape:
//     const i18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hi' } } })
//     i18n.t('hello')              // 'Hi'
//     i18n.locale()                // 'en'  — read like a signal
//
// ## Scope
//
// Supported: `t(key)` with fallback locale, `t(key, values)` with
// `{{name}}` interpolation and one/other plurals, and switching the
// active locale (`i18n.locale.set('de')` on the web lowers to an
// assignment to `locale`; every `t` read re-renders because `locale` is
// observed). Not supported: the full CLDR plural categories
// (zero/few/many), async namespace loading, `<Trans>`, `addMessages()`.

import Foundation
import Observation

/// Observable reactive-translation container — the SwiftUI half of
/// `createI18n({ locale, messages })`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonI18n {
    /// Currently-active locale. Settable: `i18n.locale.set('de')` on the
    /// web lowers to `i18n.locale = "de"`, and every view reading `t(...)`
    /// re-renders because this property is observed.
    public var locale: String

    /// Optional fallback locale used when the active locale is missing
    /// a key. Mirrors web `createI18n({ fallbackLocale })`.
    public let fallbackLocale: String?

    /// Frozen translation table — `locale → key → translation`. Baked
    /// at PMTC emit time from the literal config. Keys support
    /// dot-separated paths via runtime split (`section.title` →
    /// nested-dict lookup); v1 emit bakes flat keys directly, the
    /// split logic just preserves cross-platform parity with the web
    /// `nestFlatKeys` shape.
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

    /// `i18n.t("hello")` — look up the translation for `key` in the
    /// active locale, falling back to `fallbackLocale` (if set), then
    /// returning the key verbatim on miss. Matches web `t()` v1 scope
    /// minus interpolation (deferred).
    public func t(_ key: String) -> String {
        if let v = messages[locale]?[key] { return v }
        if let fb = fallbackLocale, let v = messages[fb]?[key] { return v }
        return key
    }

    /// Two-arg `t(key, values)` — interpolation + plurals, mirroring the
    /// web `@pyreon/i18n/core` contract:
    ///
    ///   - `{{name}}` placeholders replace with `values["name"]`
    ///     (stringified via `description` — String + Int both flow).
    ///   - When `values["count"]` is present, the plural-suffixed key is
    ///     tried FIRST: `key_one` when count == 1, else `key_other`,
    ///     falling back to the bare key. v1 ships the one/other pair
    ///     (en-style cardinal rules); the web side's full
    ///     `Intl.PluralRules` category set (few/many/zero) is not
    ///     supported — locales needing those categories should branch
    ///     in user code.
    ///
    /// PMTC emits `t('items', { count: n() })` as
    /// `t("items", ["count": n])` — the object-literal argument lowers
    /// to a dictionary at this call shape.
    public func t(_ key: String, _ values: [String: CustomStringConvertible]) -> String {
        var resolvedKey = key
        if let countValue = values["count"], let n = Int(countValue.description) {
            let suffixed = n == 1 ? "\(key)_one" : "\(key)_other"
            if messages[locale]?[suffixed] != nil
                || (fallbackLocale.flatMap { messages[$0]?[suffixed] }) != nil {
                resolvedKey = suffixed
            }
        }
        var out = t(resolvedKey)
        for (name, value) in values {
            out = out.replacingOccurrences(of: "{{\(name)}}", with: value.description)
        }
        return out
    }

}

