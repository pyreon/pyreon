/** Text direction of a locale's script. */
export type TextDirection = 'ltr' | 'rtl'

// ISO 15924 scripts written right to left (CLDR `characterOrder: right-to-left`).
const RTL_SCRIPTS = new Set([
  'Adlm',
  'Arab',
  'Hebr',
  'Mand',
  'Mend',
  'Nkoo',
  'Rohg',
  'Samr',
  'Syrc',
  'Thaa',
  'Yezi',
])

// Languages whose default script is RTL. Used only when the runtime cannot
// maximize the tag (no `Intl.Locale`, or a tag it rejects).
const RTL_LANGUAGES = new Set([
  'ar',
  'arc',
  'ckb',
  'dv',
  'fa',
  'he',
  'iw',
  'khw',
  'ks',
  'lrc',
  'mzn',
  'nqo',
  'ps',
  'sd',
  'syr',
  'ug',
  'ur',
  'yi',
])

type LocaleWithTextInfo = Intl.Locale & {
  getTextInfo?: () => { direction?: string }
  textInfo?: { direction?: string }
}

/**
 * Text direction for a BCP 47 locale tag. An explicit script subtag wins
 * (`az-Arab` → rtl, `ku-Latn` → ltr); otherwise the language's likely script
 * decides (`ar`, `fa-IR`, `ur` → rtl). Reads `Intl.Locale#getTextInfo()` (or the
 * older `textInfo` getter) when the runtime has it, then the likely script from
 * `maximize()`, then a fixed language list. Pure, no reactivity.
 */
export function localeDirection(locale: string): TextDirection {
  try {
    const loc = new Intl.Locale(locale) as LocaleWithTextInfo
    const info = typeof loc.getTextInfo === 'function' ? loc.getTextInfo() : loc.textInfo
    if (info?.direction === 'rtl' || info?.direction === 'ltr') return info.direction
    const script = loc.maximize().script
    if (script !== undefined) return RTL_SCRIPTS.has(script) ? 'rtl' : 'ltr'
    return RTL_LANGUAGES.has(loc.language) ? 'rtl' : 'ltr'
  } catch {
    // Not a well-formed tag (or no Intl.Locale): judge the primary subtag.
    const language = locale.split(/[-_]/, 1)[0]!.toLowerCase()
    return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr'
  }
}
