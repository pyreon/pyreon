import {
  generateRssFeed as generateRssFeedZero,
  toRfc822 as toRfc822Zero,
  type RssItem as RssItemZero,
} from '@pyreon/zero/server'

// ─── RSS 2.0 feed — thin adapter over `@pyreon/zero/seo` ──────────────────
//
// The actual RSS generator now lives in `@pyreon/zero` so it can be
// integrated with `seoPlugin` + `seoMiddleware` and served from a
// single canonical source. This file is a backward-compat shim that
// preserves the zero-content API surface (`baseUrl` instead of zero's
// `origin`, named export `generateRssFeed`).
//
// **New code should import directly from `@pyreon/zero`** — same
// generator, simpler integration:
//
//     import { generateRssFeed, seoPlugin } from '@pyreon/zero'

export type RssItem = RssItemZero

export interface GenerateRssFeedArgs {
  title: string
  /** Site origin (no trailing slash). */
  baseUrl: string
  description?: string
  language?: string
  items: RssItem[]
  lastBuildDate?: string
}

/**
 * @deprecated Import `generateRssFeed` from `@pyreon/zero` directly.
 *   The zero-content shim re-maps `baseUrl` → `origin`; new code
 *   should use `@pyreon/zero`'s native `RssConfig` shape.
 */
export function generateRssFeed(args: GenerateRssFeedArgs): string {
  const config: Parameters<typeof generateRssFeedZero>[0] = {
    title: args.title,
    origin: args.baseUrl,
    items: args.items,
  }
  if (args.description) config.description = args.description
  if (args.language) config.language = args.language
  if (args.lastBuildDate) config.lastBuildDate = args.lastBuildDate
  return generateRssFeedZero(config)
}

/**
 * @deprecated Import `toRfc822` from `@pyreon/zero` directly.
 */
export const toRfc822 = toRfc822Zero
