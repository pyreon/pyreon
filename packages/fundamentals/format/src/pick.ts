/** Read `locale` / `timeZone` off an options argument (a string preset, `undefined` or a wrong-typed value carries neither). */
export function localeOf(options: { locale?: string | undefined } | string | undefined): string {
  if (typeof options !== 'object' || options === null) return ''
  const locale = options.locale

  return typeof locale === 'string' ? locale : ''
}

export function zoneOf(options: { timeZone?: string | undefined } | string | undefined): string {
  if (typeof options !== 'object' || options === null) return ''
  const zone = options.timeZone

  return typeof zone === 'string' ? zone : ''
}
