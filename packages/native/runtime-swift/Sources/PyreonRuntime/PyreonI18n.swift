// PyreonI18n — SwiftUI side of @pyreon/i18n's reactive translation
// surface. Mirrors the Strategy-B v1 scope (Gap 4 PR-3): static
// messages + locale-aware lookup + key-fallback.
//
// Web shape:
//     const i18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hi' } } })
//     i18n.t('hello')              // 'Hi'
//     i18n.locale()                // 'en'  — read like a signal
//
// ## Scope — string-key, string-value v1 (foundation)
//
// v1 supports the most common 80% case: nested-key lookup with
// fallback locale. The following web-side features are explicit
// follow-ups (each is its own PR):
//
//   - `t(key, values)` interpolation (e.g. `t('hello', { name: 'Alice' })`)
//     → needs PMTC to lower the inline JS object literal `{ name: 'Alice' }`
//        into a Swift `[String: String]` arg, plus a `t(_:_:)`
//        overload on this container.
//   - `setLocale(_:)` + `i18n.locale.set(...)` writes — UI language
//     pickers. v1 ships READ-ONLY; setting locale is host-side via
//     a one-off Swift helper.
//   - Pluralization (`_one` / `_other` suffixes), async namespace
//     loading, `<Trans>` rich-text component, `addMessages()`.
//
// The runtime API surface mirrors @pyreon/i18n/core's NON-async
// subset; advanced features layer on top in follow-up PRs without
// breaking v1's contract.

import Foundation
import Observation

/// Observable reactive-translation container — the SwiftUI half of
/// `createI18n({ locale, messages })`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonI18n {
    /// Currently-active locale. Read-only in v1; `setLocale(_:)`
    /// lands in a follow-up PR.
    public private(set) var locale: String

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

}

