import blogJson from './pages/channels/blog.json'
import discordJson from './pages/channels/discord.json'
import newsletterJson from './pages/channels/newsletter.json'
import openJson from './pages/channels/open.json'
import showcaseJson from './pages/channels/showcase.json'
import type { BlogChannel, OpenChannel, ShowcaseChannel, StableLinkChannel } from './types-site'

/**
 * The copy of the blog, showcase, open stats and stable-link pages, from the
 * content set's `_channels.json` (synced by `scripts/sync-site-content.ts`
 * into one file per page). The `_channels.check.ts` twin typechecks the whole
 * file against `ChannelsFile`. Static pages only: islands get their labels as
 * props, never from here.
 */
export const BLOG_COPY = blogJson as BlogChannel
export const SHOWCASE_COPY = showcaseJson as ShowcaseChannel
export const OPEN_COPY = openJson as OpenChannel
export const DISCORD_COPY = discordJson as StableLinkChannel
export const NEWSLETTER_COPY = newsletterJson as StableLinkChannel

/**
 * Fill `{name}` placeholders in a content string. A placeholder without a
 * value is a content bug, so it throws instead of printing `{name}`.
 */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error(`[Pyreon] Content placeholder {${key}} has no value in "${template}". Pass it to fill().`)
    return String(value)
  })
}
