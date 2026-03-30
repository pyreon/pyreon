import type { Props, VNode, VNodeChild } from "@pyreon/core";
import { createContext, provide, useContext } from "@pyreon/core";
import type { I18nInstance } from "./types";

export const I18nContext = createContext<I18nInstance | null>(null);

export interface I18nProviderProps extends Props {
  instance: I18nInstance;
  children?: VNodeChild;
}

/**
 * Provide an i18n instance to the component tree.
 *
 * @example
 * const i18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hello' } } })
 *
 * // In JSX:
 * <I18nProvider instance={i18n}>
 *   <App />
 * </I18nProvider>
 */
export function I18nProvider(props: I18nProviderProps): VNode {
  provide(I18nContext, props.instance);

  const ch = props.children;
  return (typeof ch === "function" ? (ch as () => VNodeChild)() : ch) as VNode;
}

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
  const instance = useContext(I18nContext);
  if (!instance) {
    throw new Error("[@pyreon/i18n] useI18n() must be used within an <I18nProvider>.");
  }
  return instance;
}
