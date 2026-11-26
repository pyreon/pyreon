// The locale of a static `*ToSvg` export: the same words and digits its live
// component takes from `locale` and `messages`.
//
// A server-rendered chart is read by the same people as the live one (a
// crawler, a reader before hydration, an email client), so `locale` picks the
// registered pack's words (`messages` winning field by field) and writes the
// numbers in the locale's digits, exactly as the components do.

import type { ChartMessages } from './a11y'
import type { Formatter } from './format'
import { chartMessagesFor, numberFormatter, plainNumberFormatter } from './locale'

/** What a `*ToSvg` export reads its words and numbers from. */
export interface SvgLocale {
  /** The pack's words under the call's own `messages`. */
  messages: ChartMessages | undefined
  /** Plain digits for the figures a sentence writes itself (counts, a change). */
  number: Formatter | undefined
  /** The value format: the call's `format`, else the locale's. */
  format: Formatter | undefined
}

export function svgLocale(o: { readonly locale?: string | undefined; readonly messages?: ChartMessages | undefined; readonly format?: Formatter | undefined }): SvgLocale {
  const tag = o.locale
  return {
    messages: chartMessagesFor(tag, o.messages),
    number: tag === undefined ? undefined : plainNumberFormatter(tag),
    format: o.format ?? (tag === undefined ? undefined : numberFormatter(tag)),
  }
}

/** `n` in the locale's plain digits, or as JavaScript writes it. */
export function svgNumber(n: number, number: Formatter | undefined): string {
  return number === undefined ? `${n}` : number(n)
}

/**
 * A derived description: `template` with every `{slot}` filled when the call
 * has one (the locale's words), else the English sentence the caller built.
 */
export function svgSentence(template: string | undefined, english: () => string, slots: Readonly<Record<string, string>>): string {
  if (template === undefined) return english()
  let out = template
  for (const [key, value] of Object.entries(slots)) out = out.split(`{${key}}`).join(value)

  return out
}
