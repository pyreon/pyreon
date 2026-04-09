/** @jsxImportSource @pyreon/core */
// ─── Why the JSX pragma ───────────────────────────────────────────────
//
// The Pyreon JSX runtime is normally selected via tsconfig.json's
// `jsxImportSource: '@pyreon/core'` setting. That works fine when
// consumers run the COMPILED `lib/index.js` (the `import` condition
// in this package's exports map) — the JSX has already been
// transformed at build time.
//
// But when consumers resolve `@pyreon/i18n` via the `bun` condition,
// bun gets `src/index.ts`, which re-exports from this file
// (`trans.tsx`), and bun has to compile the JSX on the fly. Bun
// reads the **consuming project's** tsconfig.json — NOT this
// package's. If the consumer is a backend that doesn't use JSX
// itself, its tsconfig has no `jsxImportSource` set, so bun falls
// back to React's JSX runtime — which doesn't exist in
// non-React-aware projects, and the import explodes with a
// `Cannot find module 'react/jsx-runtime'` error.
//
// The per-file `@jsxImportSource` pragma overrides whatever
// tsconfig says. With this comment in place, ANY consumer (bun
// runtime, backend, non-React frontend, anything) gets the
// correct Pyreon JSX runtime when this file is compiled.
//
// **Backend consumers should still prefer `@pyreon/i18n/core`**
// (which avoids JSX entirely) — see the README. This pragma is a
// defensive belt-and-braces fix for the case where someone imports
// from the main entry without realizing the implications.
//
// ──────────────────────────────────────────────────────────────────
import type { Props, VNode } from '@pyreon/core'
import type { InterpolationValues } from './types'

const TAG_RE = /<(\w+)>([^<]*)<\/\1>/g

interface RichPart {
  tag: string
  children: string
}

/**
 * Parse a translated string into an array of plain text and rich tag segments.
 *
 * @example
 * parseRichText("Hello <bold>world</bold>, click <link>here</link>")
 * // → ["Hello ", { tag: "bold", children: "world" }, ", click ", { tag: "link", children: "here" }]
 */
export function parseRichText(text: string): (string | RichPart)[] {
  const parts: (string | RichPart)[] = []
  let lastIndex = 0

  for (const match of text.matchAll(TAG_RE)) {
    const before = text.slice(lastIndex, match.index)
    if (before) parts.push(before)
    parts.push({ tag: match[1]!, children: match[2]! })
    lastIndex = match.index! + match[0].length
  }

  const after = text.slice(lastIndex)
  if (after) parts.push(after)

  return parts
}

export interface TransProps extends Props {
  /** Translation key (supports namespace:key syntax). */
  i18nKey: string
  /** Interpolation values for {{placeholder}} syntax. */
  values?: InterpolationValues
  /**
   * Component map for rich interpolation.
   * Keys match tag names in the translation string.
   * Values are component functions: `(children: any) => VNode`
   *
   * @example
   * // Translation: "Read the <terms>terms</terms> and <privacy>policy</privacy>"
   * components={{
   *   terms: (children) => <a href="/terms">{children}</a>,
   *   privacy: (children) => <a href="/privacy">{children}</a>,
   * }}
   */
  components?: Record<string, (children: any) => any>
  /**
   * The i18n instance's `t` function.
   * Can be obtained from `useI18n()` or passed directly.
   */
  t: (key: string, values?: InterpolationValues) => string
}

/**
 * Rich JSX interpolation component for translations.
 *
 * Allows embedding JSX components within translated strings using XML-like tags.
 * The `t` function resolves the translation and interpolates `{{values}}` first,
 * then `<tag>content</tag>` patterns are mapped to the provided components.
 *
 * @example
 * // Translation: "You have <bold>{{count}}</bold> unread messages"
 * const { t } = useI18n()
 * <Trans
 *   t={t}
 *   i18nKey="messages.unread"
 *   values={{ count: 5 }}
 *   components={{
 *     bold: (children) => <strong>{children}</strong>,
 *   }}
 * />
 * // Renders: You have <strong>5</strong> unread messages
 *
 * @example
 * // Translation: "Read our <terms>terms of service</terms> and <privacy>privacy policy</privacy>"
 * <Trans
 *   t={t}
 *   i18nKey="legal"
 *   components={{
 *     terms: (children) => <a href="/terms">{children}</a>,
 *     privacy: (children) => <a href="/privacy">{children}</a>,
 *   }}
 * />
 */
export function Trans(props: TransProps): VNode | string {
  const translated = props.t(props.i18nKey, props.values)

  if (!props.components) return translated

  const parts = parseRichText(translated)

  // If the result is a single plain string, return it directly
  if (parts.length === 1 && typeof parts[0] === 'string') return parts[0]

  const children = parts.map((part) => {
    if (typeof part === 'string') return part
    const component = props.components![part.tag]
    // Unmatched tags: render children as plain text (no raw HTML markup)
    if (!component) return part.children
    return component(part.children)
  })

  return <>{children}</>
}
