/**
 * `@pyreon/testing/i18n` — test helpers for `@pyreon/i18n`.
 *
 *   renderWithI18n(<App/>, { locale: 'en', messages: { en: {...}, cs: {...} } })
 *
 * Creates an i18n instance (or takes yours), wraps `ui` in `<I18nProvider>`,
 * and returns the render result plus the instance, a bound `t()`, and
 * `setLocale()` — locale flips are reactive (translated text patches in
 * place, no remount).
 *
 * Requires the optional peer `@pyreon/i18n`.
 */
import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { I18nInstance, I18nOptions } from '@pyreon/i18n'
import { createI18n, I18nProvider } from '@pyreon/i18n'
import type { RenderOptions, RenderResult } from '@pyreon/testing'
import { render } from '@pyreon/testing'

export interface RenderWithI18nOptions extends RenderOptions, Partial<I18nOptions> {
  /** Bring your own instance (from `createI18n`) instead of `locale`/`messages`. */
  i18n?: I18nInstance
  /** Compose an OUTER wrapper around the provider tree. */
  wrapper?: (children: VNodeChild) => VNodeChild
}

export type RenderWithI18nResult = RenderResult & {
  /** The live i18n instance. */
  i18n: I18nInstance
  /** Bound `t()` — translate in assertions without threading the instance. */
  t: I18nInstance['t']
  /** Switch locale reactively — rendered translations patch in place. */
  setLocale: (locale: string) => void
}

/**
 * Render `ui` under an `<I18nProvider>`.
 *
 * @example
 *   const { getByText, setLocale, t } = renderWithI18n(<Nav />, {
 *     locale: 'en',
 *     messages: { en: { home: 'Home' }, cs: { home: 'Domů' } },
 *   })
 *   getByText('Home')
 *   setLocale('cs')
 *   getByText(t('home')) // 'Domů'
 */
export function renderWithI18n(
  ui: VNodeChild,
  options: RenderWithI18nOptions,
): RenderWithI18nResult {
  const { i18n: given, wrapper, container, baseElement, ...i18nOptions } = options
  if (given === undefined && typeof i18nOptions.locale !== 'string') {
    throw new Error('[Pyreon] renderWithI18n: pass `locale` + `messages` (or a pre-built `i18n` instance).')
  }
  const i18n = given ?? createI18n(i18nOptions as I18nOptions)

  // Rebuild render options conditionally (exactOptionalPropertyTypes — an
  // explicit `undefined` is not assignable to the optional fields).
  const renderOptions: RenderOptions = {}
  if (container !== undefined) renderOptions.container = container
  if (baseElement !== undefined) renderOptions.baseElement = baseElement

  const tree = h(I18nProvider, { value: i18n }, ui)
  const result = render(wrapper ? wrapper(tree) : tree, renderOptions)

  return {
    ...result,
    i18n,
    t: i18n.t,
    setLocale: (locale) => i18n.locale.set(locale),
  }
}
