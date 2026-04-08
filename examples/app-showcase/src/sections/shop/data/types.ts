/**
 * Types for the shop section.
 *
 * Prices are stored in a base currency (USD) and converted at display
 * time via the currency rate table. The product translations live in
 * the i18n message catalog keyed by product id, so adding a locale
 * is a one-message-per-product affair.
 */

export type Currency = 'USD' | 'EUR' | 'GBP'
export type Locale = 'en' | 'de' | 'fr'
export type Category = 'apparel' | 'home' | 'tech' | 'books'

export interface Product {
  id: string
  /** Translation key suffix used by `i18n.t('product:<id>.title')`. */
  category: Category
  /** Base price in USD — converted at render time per the active currency. */
  priceUsd: number
  /** Hex emoji label used as the product image stand-in. */
  emoji: string
}

/** A line in the cart — references a product id + quantity. */
export interface CartLine {
  productId: string
  qty: number
}
