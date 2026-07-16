/**
 * Framework-agnostic i18n core — no @pyreon/core dependency.
 * Use this entry point for backend/server usage where you only need
 * createI18n() and translation utilities.
 *
 * @example
 * ```ts
 * import { createI18n, interpolate } from "@pyreon/i18n/core"
 * ```
 */
export { createI18n } from './create-i18n'
export { interpolate } from './interpolation'
export { resolvePluralCategory } from './pluralization'
export type {
  DateFormats,
  I18nInstance,
  I18nOptions,
  InterpolationValue,
  InterpolationValues,
  NamedFormatters,
  NamespaceLoader,
  NumberFormats,
  PluralRules,
  RelativeTimeFormats,
  TranslationDictionary,
  TranslationMessages,
} from './types'
export type {
  MessageKeys,
  TranslationParams,
  TypedTranslationKey,
} from './type-helpers'
