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
// non-React-aware projects, and the import explodes with:
//
//   error: Cannot find module 'react/jsx-dev-runtime'
//          from '/.../i18n/src/trans.tsx'
//
// **Verified end-to-end by `src/tests/backend-import.test.ts`.**
// Removing this pragma causes a real bun subprocess in a
// non-JSX-tsconfig fixture to crash at import time with the exact
// error above. The regression test catches it.
//
// The per-file `@jsxImportSource` pragma overrides whatever
// tsconfig says — it's a TypeScript directive that bun's
// transpiler honors. With this comment in place, ANY consumer
// (bun runtime, backend, non-React frontend, anything) gets the
// correct Pyreon JSX runtime when this file is compiled.
//
// **Backend consumers should still prefer `@pyreon/i18n/core`**
// (which avoids JSX entirely) — see the README. This pragma is a
// defensive belt-and-braces fix for the case where someone imports
// from the main entry without realizing the implications.
//
// ──────────────────────────────────────────────────────────────────
import type { Props, VNodeChild } from '@pyreon/core'
import { useI18n } from './context'
import type { InterpolationValues } from './types'

const TAG_RE = /<(\w+)>([^<]*)<\/\1>/g

// Sentinels standing in for `<` / `>` inside INTERPOLATED values while the tag
// parser runs. Unicode noncharacters (U+FDD0/U+FDD1) — permanently unassigned,
// never valid in interchange text, so a real translation never contains them.
const LT = '\uFDD0'
const GT = '\uFDD1'
const LT_RE = /\uFDD0/g
const GT_RE = /\uFDD1/g

// Option keys `t()` reads for resolution, not text: escaping them would change
// which key is picked (`context`) or break pluralization (`count`), and
// `defaultValue` is itself a TEMPLATE whose tags must stay live.
const RESERVED_VALUE_KEYS = new Set(['count', 'context', 'defaultValue'])

function escapeAngles(s: string): string {
  return s.includes('<') || s.includes('>') ? s.replace(/</g, LT).replace(/>/g, GT) : s
}

function unescapeAngles(s: string): string {
  return s.includes(LT) || s.includes(GT) ? s.replace(LT_RE, '<').replace(GT_RE, '>') : s
}

/**
 * Neutralise every angle bracket a VALUE could contribute, so tag parsing only
 * ever sees tags the TRANSLATION wrote. Objects are pre-serialized to the same
 * JSON `interpolate` would produce, then escaped.
 */
function escapeValues(values: InterpolationValues | undefined): InterpolationValues | undefined {
  if (!values) return values
  let out: InterpolationValues | undefined
  for (const key of Object.keys(values)) {
    if (RESERVED_VALUE_KEYS.has(key)) continue
    const v = values[key]
    let escaped: string | undefined
    if (typeof v === 'string') escaped = escapeAngles(v)
    else if (typeof v === 'object' && v !== null && !(v instanceof Date)) {
      try {
        const json = JSON.stringify(v)
        // Only replace the object when it could contribute a bracket — else it
        // stays an object, so an inline format spec still receives the value.
        if (json.includes('<') || json.includes('>')) escaped = escapeAngles(json)
      } catch {
        continue // leave it to interpolate's own not-serializable handling
      }
    }
    if (escaped !== undefined && escaped !== v) {
      out ??= { ...values }
      out[key] = escaped
    }
  }
  return out ?? values
}
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
   * The i18n instance's `t` function. Optional — when omitted, `<Trans>` reads
   * it from the nearest `<I18nProvider>` via `useI18n()`. Pass it explicitly
   * only to override the context instance (or in a provider-less render).
   */
  t?: (key: string, values?: InterpolationValues) => string
}

/**
 * Rich JSX interpolation component for translations.
 *
 * Allows embedding JSX components within translated strings using XML-like tags.
 * Tags come ONLY from the translation: angle brackets inside interpolated
 * `{{values}}` are neutralised before `<tag>content</tag>` patterns are mapped
 * to the provided components, so a user-controlled value (a name, a comment)
 * can never close one tag and open another — it renders as literal text.
 *
 * @example
 * // Translation: "You have <bold>{{count}}</bold> unread messages"
 * // `t` is read from <I18nProvider> automatically — no `t={t}` needed.
 * <Trans
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
export function Trans(props: TransProps): VNodeChild {
  // Read the instance ONCE at setup — a `useI18n()` context read must run in the
  // component's owner frame, not lazily inside the accessor. `??` short-circuits,
  // so passing `t` works without an <I18nProvider>.
  const t = props.t ?? useI18n().t

  // Return an ACCESSOR, not the resolved value. A component body runs ONCE, and
  // `t()` reads `locale()` — so returning `translated` directly froze <Trans> in
  // whatever language it first rendered in, and `i18n.locale.set(...)` never
  // updated it (while every `{() => t(...)}` binding elsewhere in the app did).
  // The JSX-child accessor is a tracking scope, so `t()`'s `locale()` read
  // re-runs this on locale change.
  return () => {
    const components = props.components
    if (!components) return t(props.i18nKey, props.values)

    // Interpolate with angle brackets in VALUES replaced by sentinels, parse
    // tags, then restore the brackets inside each text segment. Interpolating
    // first and parsing after (the old order) let a value such as
    // `x</bold><link>…` become a real `link` component call.
    const translated = t(props.i18nKey, escapeValues(props.values))
    const parts = parseRichText(translated)

    // If the result is a single plain string, return it directly
    if (parts.length === 1 && typeof parts[0] === 'string') return unescapeAngles(parts[0])

    const children = parts.map((part) => {
      if (typeof part === 'string') return unescapeAngles(part)
      const text = unescapeAngles(part.children)
      // OWN keys only — `components.toString` is inherited, not a component.
      const component = Object.hasOwn(components, part.tag) ? components[part.tag] : undefined
      // Unmatched tags: render children as plain text (no raw HTML markup)
      if (typeof component !== 'function') return text
      return component(text)
    })

    return <>{children}</>
  }
}
