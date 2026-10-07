/**
 * The compile-gate stubs the `@pyreon/i18n` lowering's emit needs beyond the SwiftUI / Compose stub bundle: the
 * `PyreonI18n` container a `createI18n` declaration emits. They mirror the REAL runtimes (`@pyreon/i18n/native`)
 * exactly — a superset stub masks real breakage, a narrower one manufactures it.
 *
 * Appended to the bundle only for an emit that names the type (see {@link i18nStubs}); the compiler never reads them.
 */

import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const I18N_SWIFT_STUBS = `public struct PyreonI18n {
  // fallbackLocale is OPTIONAL and DEFAULTED in the real PyreonI18n. The stub
  // made it required, so \`createI18n({ locale, messages })\` — the two-argument
  // form the docs show and the common case — was REJECTED by the gate with
  // "missing argument for parameter 'fallbackLocale'". Valid source, failing
  // build. Same class as the coolgrid frame stub: a SUBSET stub manufactures
  // failures exactly as a SUPERSET stub masks them, and the fix is the same —
  // mirror the real signature, do not guess at it.
  public init(
    locale: String,
    messages: [String: [String: String]],
    fallbackLocale: String? = nil
  ) {}
  // t(key) OR t(key, interpolation values) — the emit passes [String: Any]-shaped
  // dictionary literals ([String: String] and [String: Int] both coerce).
  public func t(_ key: String, _ values: [String: Any] = [:]) -> String { "" }
}
`

export const I18N_KOTLIN_STUBS = `// PyreonI18n — Gap 4 PR-3 (Strategy-B port for @pyreon/i18n/core, v1).
// Real impl in @pyreon/native-runtime-kotlin's PyreonI18n.kt.
class PyreonI18n(
  initialLocale: String,
  val messages: Map<String, Map<String, String>>,
  val fallbackLocale: String? = null,
) {
  var locale: String = initialLocale
    private set
  fun t(key: String): String {
    messages[locale]?.get(key)?.let { return it }
    if (fallbackLocale != null) {
      messages[fallbackLocale]?.get(key)?.let { return it }
    }
    return key
  }
  // Two-arg overload — interpolation + one/other plurals. Mirrors the
  // REAL runtime-kotlin signature t(key, values: Map<String, Any?>)
  // (see PyreonI18n.kt) so the emitted dict-arg call shape
  // i18n.t("items", mapOf("count" to n)) typechecks here.
  fun t(key: String, values: Map<String, Any?>): String {
    var out = t(key)
    for ((name, value) in values) {
      out = out.replace("{{" + name + "}}", value?.toString() ?: "")
    }
    return out
  }
}
`

/** The `PyreonI18n` compile-gate stub, appended only to an emit that names the type. */
export const i18nStubs: StubAugmentation = {
  swift: (source) => (/\bPyreonI18n\b/.test(source) ? I18N_SWIFT_STUBS : ''),
  kotlin: (source) => (/\bPyreonI18n\b/.test(source) ? I18N_KOTLIN_STUBS : ''),
}
