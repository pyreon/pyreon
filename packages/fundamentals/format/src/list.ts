/** `formatList`: `Intl.ListFormat` with a cached formatter. */
import type { KindDef } from './formatter'
import { clearTable, construct, createTable, resolve } from './cache'
import { badLocale, fallbackOf, preset } from './number'
import { programmerError } from './warn'
import type { ListInput, ListOptions, ListPreset } from './types'

const LIST_PRESETS: Record<ListPreset, Intl.ListFormatOptions> = {
  and: { type: 'conjunction' },
  or: { type: 'disjunction' },
  unit: { type: 'unit' },
}

const listTable = /* @__PURE__ */ createTable<Intl.ListFormat>((locale, _variant, options) => {
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

/** The strings to join, or `undefined` when there is nothing to list. */
function listItems(items: ListInput): string[] | undefined {
  if (items == null) return undefined
  const list = toItems(items)

  return list.length === 0 ? undefined : list
}

export function listIn(locale: string, items: ListInput, options: ListOptions | ListPreset | undefined): string {
  const list = listItems(items)
  if (list === undefined) return fallbackOf(options)

  return resolve(listTable, locale, '', options).format(list)
}

/** Spec of `listFormatter`: an options object, or a preset name. */
export function listSpec(options: ListOptions | ListPreset | undefined): ListOptions {
  if (typeof options === 'string') return { ...preset(LIST_PRESETS, options, 'listFormatter') }

  return options ?? {}
}

export const listKind: KindDef<'list'> = {
  create(spec, locale) {
    const fb = spec.fallback ?? ''
    let at = ''
    let intl: Intl.ListFormat | undefined
    const get = (l: string): Intl.ListFormat => {
      if (intl === undefined || l !== at) {
        intl = resolve(listTable, l, '', spec)
        at = l
      }

      return intl
    }

    return {
      call: (items) => {
        const l = locale()
        const list = listItems(items)

        return list === undefined ? fb : get(l).format(list)
      },
      parts: (items) => {
        const l = locale()
        const list = listItems(items)

        return list === undefined ? [] : get(l).formatToParts(list)
      },
    }
  },
}

/** Test hook. */
export function _clearListTable(): void {
  clearTable(listTable)
}

export const _listTable = listTable
