/** `formatList`: `Intl.ListFormat` with a cached formatter. */
import { clearTable, construct, createTable, resolve } from './cache'
import { badLocale, fallbackOf, preset } from './number'
import { programmerError } from './warn'
import type { ListInput, ListOptions, ListPreset } from './types'

const LIST_PRESETS: Record<ListPreset, Intl.ListFormatOptions> = {
  and: { type: 'conjunction' },
  or: { type: 'disjunction' },
  unit: { type: 'unit' },
}

const listTable = createTable<Intl.ListFormat>((locale, _variant, options) => {
  const o: Intl.ListFormatOptions =
    options === undefined ? {} : typeof options === 'string' ? preset(LIST_PRESETS, options, 'formatList') : options
  return construct(
    (l, opts) => new Intl.ListFormat(l, opts),
    locale,
    o,
    (error) =>
      programmerError(
        'formatList',
        `${error instanceof Error ? error.message : String(error)}. type is 'conjunction' | 'disjunction' | 'unit', style is 'long' | 'short' | 'narrow'.`,
      ),
    badLocale('formatList'),
  )
})

/**
 * Items become strings: strings stay, nullish entries are skipped, anything
 * else goes through `String`. A bare string is ONE item (a string is iterable;
 * `Intl.ListFormat` would join its characters).
 */
function toItems(items: NonNullable<ListInput>): string[] {
  if (typeof items === 'string') return [items]
  const out: string[] = []
  for (const item of items) {
    if (item == null) continue
    out.push(typeof item === 'string' ? item : String(item))
  }
  return out
}

export function listIn(locale: string, items: ListInput, options: ListOptions | ListPreset | undefined): string {
  if (items == null) return fallbackOf(options)
  const list = toItems(items)
  if (list.length === 0) return fallbackOf(options)
  return resolve(listTable, locale, '', options).format(list)
}

/** Test hook. */
export function _clearListTable(): void {
  clearTable(listTable)
}
export const _listTable = listTable
