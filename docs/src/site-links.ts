/**
 * The community channels that may not exist yet, and the one rule that keeps
 * the site honest about them.
 *
 * Posts link to `https://pyreon.dev/discord` and `https://pyreon.dev/newsletter`,
 * never to the channel itself, so a link that is already published keeps
 * working when a channel opens or moves. To switch one on, set its target
 * below (one line) and merge: the next deploy writes `/<channel>` as a
 * static redirect and every link to it in the site content comes back.
 *
 * While a target is `null` the channel does not exist on the site at all:
 * `vite-plugins/channel-gate.ts` applies `gateChannels` to every content
 * JSON file (each list item that links the channel is dropped, no
 * `withChannel` copy is used) and writes no `/<channel>` page, so the address
 * is a 404 and in no sitemap.
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

/** The channels whose address is set, in `SITE_LINKS` order. */
export function openChannels(links: Record<SiteLinkKey, string | null> = SITE_LINKS): SiteLinkKey[] {
  return (Object.keys(links) as SiteLinkKey[]).filter((key) => resolveSiteLink(key, links) !== null)
}

const SITE_ORIGIN = 'https://pyreon.dev'
const KEYS = Object.keys(SITE_LINKS) as SiteLinkKey[]

/**
 * The channel an address points at (`/discord`, `https://pyreon.dev/discord`,
 * with or without a trailing slash, query or fragment), if any.
 */
export function channelOf(href: string): SiteLinkKey | undefined {
  const path = href.startsWith(SITE_ORIGIN) ? href.slice(SITE_ORIGIN.length) : href
  const m = /^\/([a-z]+)\/?(?:[?#].*)?$/.exec(path)
  return m && (KEYS as string[]).includes(m[1] as string) ? (m[1] as SiteLinkKey) : undefined
}

/** A Markdown link target inside copy: `](/discord)`, `](https://pyreon.dev/newsletter#x)`. */
const MD_TARGET = /\]\(\s*([^)\s]+)/g

type Json = unknown

/**
 * Applies the channel rule to one content file (a parsed JSON value; the
 * input is not modified):
 *
 *   - an array item whose `href` or `route` points at a closed channel is
 *     dropped (nav and footer links, buttons, link lists, sitemap rows);
 *   - an object's `withChannel: { <channel>: {...} }` is merged over the
 *     object while that channel is open, and the key is removed either way,
 *     so copy that names a channel inside a sentence has a channel-free
 *     default written in the content.
 *
 * Anything that would still link a closed channel afterwards (an `href` in
 * a single slot with no `withChannel` default, or a Markdown link inside a
 * string) throws, naming the file and the path, so a dead link fails the
 * build instead of shipping. A `route` outside a list is a page's own address
 * (the redirect pages' copy), not a link, and is left alone.
 */
export function gateChannels<T extends Json>(data: T, file: string, links: Record<SiteLinkKey, string | null> = SITE_LINKS): T {
  const open = new Set(openChannels(links))
  const closed = (href: unknown): boolean => {
    if (typeof href !== 'string') return false
    const key = channelOf(href)
    return key !== undefined && !open.has(key)
  }
  const walk = (node: Json, at: string): Json => {
    if (Array.isArray(node)) {
      return node
        .filter((item) => !(item && typeof item === 'object' && !Array.isArray(item) && (closed((item as Record<string, unknown>).href) || closed((item as Record<string, unknown>).route))))
        .map((item, i) => walk(item, `${at}[${i}]`))
    }
    if (node && typeof node === 'object') {
      const obj: Record<string, unknown> = { ...(node as Record<string, unknown>) }
      const variants = obj.withChannel
      delete obj.withChannel
      if (variants !== undefined) {
        if (!variants || typeof variants !== 'object' || Array.isArray(variants)) {
          throw new Error(`[Pyreon] ${file}: ${at}.withChannel must be an object keyed by channel (${KEYS.join(', ')}).`)
        }
        for (const [key, override] of Object.entries(variants)) {
          if (!(KEYS as string[]).includes(key)) {
            throw new Error(`[Pyreon] ${file}: ${at}.withChannel.${key} names no channel. Use one of: ${KEYS.join(', ')}.`)
          }
          if (open.has(key as SiteLinkKey)) Object.assign(obj, override)
        }
      }
      for (const [key, value] of Object.entries(obj)) {
        const path = `${at}.${key}`
        if (key === 'href' && closed(value)) {
          throw new Error(
            `[Pyreon] ${file}: ${path} links to ${String(value)}, a channel that is not open (SITE_LINKS in docs/src/site-links.ts). ` +
              'Link somewhere that exists and put the channel link in `withChannel`, or make it an item of a list (dropped while the channel is closed).',
          )
        }
        obj[key] = walk(value, path)
      }
      return obj
    }
    if (typeof node === 'string') {
      for (const m of node.matchAll(MD_TARGET)) {
        if (closed(m[1])) {
          throw new Error(
            `[Pyreon] ${file}: ${at} links to ${m[1]} inside its text, a channel that is not open. Write the sentence without it and put the channel version in \`withChannel\`.`,
          )
        }
      }
    }
    return node
  }
  return walk(data, '$') as T
}
