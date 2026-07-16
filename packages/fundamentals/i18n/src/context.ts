import type { Props, VNode, VNodeChild } from '@pyreon/core'
import { createContext, nativeCompat, provide, useContext } from '@pyreon/core'
import type { I18nInstance } from './types'

export const I18nContext = createContext<I18nInstance | null>(null)

export interface I18nProviderProps extends Props {
  /** The i18n instance to provide (from `createI18n`). */
  value: I18nInstance
  children?: VNodeChild
}

/**
 * Provide an i18n instance to the component tree.
 *
 * @example
 * const i18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hello' } } })
 *
 * // In JSX:
 * <I18nProvider value={i18n}>
 *   <App />
 * </I18nProvider>
 */
function I18nProvider(props: I18nProviderProps): VNode {
  provide(I18nContext, props.value)

  const ch = props.children
  return (typeof ch === 'function' ? (ch as () => VNodeChild)() : ch) as VNode
}

// Mark as native — compat-mode jsx() runtimes skip wrapCompatComponent so
// provide(I18nContext, ...) runs inside Pyreon's setup frame.
// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _I18nProvider = /* @__PURE__ */ nativeCompat(I18nProvider)
export { _I18nProvider as I18nProvider }
/**
 * Access the i18n instance from the nearest I18nProvider.
 * Must be called within a component tree wrapped by I18nProvider.
 *
 * @example
 * function Greeting() {
 *   const { t, locale } = useI18n()
 *   return <h1>{t('greeting', { name: 'World' })}</h1>
 * }
 */
export function useI18n(): I18nInstance {
  const instance = useContext(I18nContext)
  if (!instance) {
    throw new Error('[@pyreon/i18n] useI18n() must be used within an <I18nProvider>.')
  }
  return instance
}
