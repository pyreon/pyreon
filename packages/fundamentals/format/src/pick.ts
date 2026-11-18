/** Read `locale` / `timeZone` off an options argument (a string preset or `undefined` carries neither). */
export function localeOf(options: { locale?: string | undefined } | string | undefined): string {
  return (typeof options === 'object' && options.locale) || ''
}

export function zoneOf(options: { timeZone?: string | undefined } | string | undefined): string {
  return (typeof options === 'object' && options.timeZone) || ''
}
