import type { Currency, Product } from './types'

/**
 * Static product catalog. The shop is small (12 products) so the
 * catalog can be hard-coded — a real store would fetch from an API
 * via `@pyreon/query`.
 */
export const PRODUCTS: Product[] = [
  { id: 'tshirt-classic', category: 'apparel', priceUsd: 28, emoji: '👕' },
  { id: 'hoodie-zip', category: 'apparel', priceUsd: 65, emoji: '🧥' },
  { id: 'sneakers-runner', category: 'apparel', priceUsd: 110, emoji: '👟' },
  { id: 'cap-curved', category: 'apparel', priceUsd: 24, emoji: '🧢' },
  { id: 'mug-ceramic', category: 'home', priceUsd: 16, emoji: '☕' },
  { id: 'plant-pot', category: 'home', priceUsd: 22, emoji: '🪴' },
  { id: 'lamp-desk', category: 'home', priceUsd: 89, emoji: '🛋️' },
  { id: 'headphones-over', category: 'tech', priceUsd: 199, emoji: '🎧' },
  { id: 'keyboard-mech', category: 'tech', priceUsd: 145, emoji: '⌨️' },
  { id: 'webcam-hd', category: 'tech', priceUsd: 75, emoji: '📷' },
  { id: 'novel-paperback', category: 'books', priceUsd: 14, emoji: '📕' },
  { id: 'cookbook-hardcover', category: 'books', priceUsd: 32, emoji: '📗' },
]

/**
 * Currency conversion rates from USD. Real apps would fetch these
 * from a forex API; the demo uses fixed rates so screenshots are
 * stable across reloads.
 */
export const CURRENCY_RATES: Record<Currency, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
}

/** Display label per locale for the currency switcher. */
export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
}
