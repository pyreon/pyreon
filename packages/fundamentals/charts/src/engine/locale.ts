// Locale packs — number and date formatting for axis labels and tooltips.
//
// Built on Intl so the common locales need no registration; a pack overrides
// or extends what Intl produces (custom month names, a fixed number format).

import type { Formatter } from './format'
import type { Double } from './types'

export interface LocalePack {
  /** Intl.NumberFormat options applied to every number label. */
  number?: Intl.NumberFormatOptions | undefined
  /** Intl.DateTimeFormat options applied to time-axis labels. */
  date?: Intl.DateTimeFormatOptions | undefined
  /** Twelve month names, when Intl's are not wanted. */
  monthNames?: string[] | undefined
}

const registry = new Map<string, LocalePack>()

/** Register (or replace) a locale pack under a BCP 47 tag. */
export function registerLocale(tag: string, pack: LocalePack): void {
  registry.set(tag, { ...pack })
}

/** The pack registered under `tag`, or null. */
export function getLocale(tag: string): LocalePack | null {
  const p = registry.get(tag)
  return p === undefined ? null : { ...p }
}

function safeNumberFormat(tag: string, options: Intl.NumberFormatOptions | undefined): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(tag, { maximumFractionDigits: 2, ...options })
  } catch {
    return new Intl.NumberFormat('en', { maximumFractionDigits: 2, ...options })
  }
}

/** A number formatter for `tag` — the registered pack's options, else Intl defaults (up to 2 decimals). */
export function numberFormatter(tag: string): Formatter {
  const pack = registry.get(tag)
  const nf = safeNumberFormat(tag, pack?.number)
  return (v: Double): string => (Number.isFinite(v) ? nf.format(v) : '')
}

/** A date formatter over epoch milliseconds for `tag`; `monthNames` in a pack win over Intl. */
export function dateFormatter(tag: string): Formatter {
  const pack = registry.get(tag)
  const names = pack?.monthNames
  if (names !== undefined && names.length === 12) {
    return (ms: Double): string => {
      const d = new Date(ms)
      return `${d.getUTCDate()} ${names[d.getUTCMonth()]}`
    }
  }
  let df: Intl.DateTimeFormat
  try {
    df = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', month: 'short', day: 'numeric', ...pack?.date })
  } catch {
    df = new Intl.DateTimeFormat('en', { timeZone: 'UTC', month: 'short', day: 'numeric', ...pack?.date })
  }
  return (ms: Double): string => (Number.isFinite(ms) ? df.format(new Date(ms)) : '')
}
