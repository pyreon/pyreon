import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/i18n
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton('@pyreon/i18n', '0.24.6', import.meta.url)

export type { I18nProviderProps } from './context'
export { I18nContext, I18nProvider, useI18n } from './context'
export { createI18n } from './create-i18n'
export { interpolate } from './interpolation'
export { resolvePluralCategory } from './pluralization'
export type { TransProps } from './trans'
export { parseRichText, Trans } from './trans'
export type {
  I18nInstance,
  I18nOptions,
  InterpolationValues,
  NamespaceLoader,
  PluralRules,
  TranslationDictionary,
  TranslationMessages,
} from './types'
