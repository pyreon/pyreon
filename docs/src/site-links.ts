/**
 * Stable addresses on pyreon.dev that forward to a community channel.
 *
 * Posts link to `https://pyreon.dev/discord` and `https://pyreon.dev/newsletter`,
 * never to the channel itself, so a link that is already published keeps
 * working when a channel opens or moves. To switch one on, set its target
 * below (one line) and merge; the next deploy turns the page into a redirect.
 * While a target is `null` the page stays a real page that sends people to
 * the place that exists today.
 */
export const SITE_LINKS = {
  /** Community Discord invite, e.g. `'https://discord.gg/abc123'`. */
  discord: null,
  /** Newsletter sign-up page, e.g. `'https://buttondown.com/pyreon'`. */
  newsletter: null,
} satisfies Record<string, string | null>

export type SiteLinkKey = keyof typeof SITE_LINKS

/**
 * The validated redirect target for a stable link, or `null` while it is
 * switched off. Throws on a target that is not an absolute `https:` URL, so
 * a typo fails the build instead of shipping a redirect to nowhere.
 *
 * The target is used exactly as configured: whatever query string a visitor
 * arrives with stays on pyreon.dev (the redirect is a static page, so it
 * cannot see it) and never reaches the destination.
 */
export function resolveSiteLink(
  key: SiteLinkKey,
  links: Record<SiteLinkKey, string | null> = SITE_LINKS,
): string | null {
  const target = links[key]
  if (target === null) return null
  let url: URL
  try {
    url = new URL(target)
  } catch {
    throw new Error(`[Pyreon] SITE_LINKS.${key} is not a URL: ${JSON.stringify(target)}. Use an absolute https:// address.`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`[Pyreon] SITE_LINKS.${key} must be an https:// URL, got ${JSON.stringify(target)}.`)
  }
  return url.href
}
