/**
 * Structured content blocks. Each block kind maps to one rendered DOM
 * element in `BlockRenderer.tsx`. Posts are authored as `Block[]` so
 * the example doesn't need a runtime markdown parser, the content is
 * type-checked, and the renderer can do anything (e.g. inject styled
 * components per block kind).
 */
export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'quote'; text: string; cite?: string }
  | { kind: 'code'; lang?: string; text: string }
  | { kind: 'list'; items: string[] }

/** A blog post. */
export interface Post {
  /** URL slug — `/blog/<slug>`. Must be unique. */
  slug: string
  /** Display title. */
  title: string
  /** Short summary shown on the index card and in <meta description>. */
  excerpt: string
  /** ISO 8601 publish date. Sorted desc on the index page. */
  date: string
  /** Author display name. */
  author: string
  /** Category tags — used for the URL filter. */
  tags: string[]
  /** Estimated read time in minutes. Computed from `body` length below. */
  readMinutes: number
  /** Content blocks. */
  body: Block[]
  /** Optional og:image URL. */
  ogImage?: string
}
