import { quote, warnOnce } from './warn'

/** `true` when `Intl` accepts `zone` as a time zone name. */
function isZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone })

    return true
  } catch {
    return false
  }
}

/**
 * Build something that needs a time zone. A zone often comes from user profile data, so an invalid one degrades
 * like an invalid locale does: one dev warning, then the build is retried with the active (runtime) zone.
 * Costs nothing on the success path: the zone is only checked when the build fails, and a failure for another
 * reason is rethrown unchanged.
 */
export function withZoneFallback<T>(zone: string, fn: string, make: (zone: string) => T): T {
  try {
    return make(zone)
  } catch (error) {
    if (zone === '' || isZone(zone)) throw error
    if (process.env.NODE_ENV !== 'production') {
      warnOnce(
        `${fn}:zone:${zone}`,
        `[Pyreon] ${fn}(): ${quote(zone)} is not an IANA time zone name; using the active zone. Use a name such as "Europe/Prague", "America/Los_Angeles" or "UTC".`,
      )
    }

    return make('')
  }
}
