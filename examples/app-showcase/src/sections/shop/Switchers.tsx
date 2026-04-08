import { useI18n } from '@pyreon/i18n'
import { CURRENCY_SYMBOL } from './data/products'
import type { Currency, Locale } from './data/types'
import { LOCALES } from './i18n'
import { useCart } from './cartStore'
import { SwitcherButton, SwitcherGroup } from './styled'

const CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP']

/**
 * Top-bar locale switcher. Writes to `i18n.locale` — every `t()` call
 * inside the component tree re-evaluates because the i18n instance
 * exposes `locale` as a Pyreon signal.
 */
export function LocaleSwitcher() {
  const i18n = useI18n()
  return (
    <SwitcherGroup>
      {LOCALES.map((option) => (
        <SwitcherButton
          type="button"
          $active={i18n.locale() === option.code}
          onClick={() => i18n.locale.set(option.code as Locale)}
          title={option.label}
        >
          {option.flag} {option.code.toUpperCase()}
        </SwitcherButton>
      ))}
    </SwitcherGroup>
  )
}

/**
 * Top-bar currency switcher. Persists the selection through the cart
 * store's `useStorage`-backed `currency` signal so a refresh keeps
 * the user's choice.
 */
export function CurrencySwitcher() {
  const cart = useCart()
  return (
    <SwitcherGroup>
      {CURRENCIES.map((c) => (
        <SwitcherButton
          type="button"
          $active={cart.store.currency() === c}
          onClick={() => cart.store.setCurrency(c)}
        >
          {CURRENCY_SYMBOL[c]} {c}
        </SwitcherButton>
      ))}
    </SwitcherGroup>
  )
}
