import blogJson from './pages/channels/blog.json'
import openJson from './pages/channels/open.json'
import showcaseJson from './pages/channels/showcase.json'
import type { BlogChannel, OpenChannel, ShowcaseChannel } from './types-site'

/**
 * The copy of the blog, showcase and open stats pages, from the content set's
 * `_channels.json` (synced by `scripts/sync-site-content.ts` into one file per
 * page). The stable links' redirect copy (`discord.json`, `newsletter.json`)
 * is read by `vite-plugins/channel-gate.ts`, which writes those pages. The
 * `_channels.check.ts` twin typechecks the whole file against `ChannelsFile`.
 * Static pages only: islands get their labels as props, never from here.
 */
export const BLOG_COPY = blogJson as BlogChannel
export const SHOWCASE_COPY = showcaseJson as ShowcaseChannel
export const OPEN_COPY = openJson as OpenChannel

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
