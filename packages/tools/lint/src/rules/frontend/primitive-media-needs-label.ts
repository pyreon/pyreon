import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, hasJSXAttribute } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * Opt-in, dependency-gated `@pyreon/primitives` best-practice rule —
 * the multiplatform analog of `pyreon/require-img-alt`.
 *
 * The canonical media primitives `<Image>` and `<Icon>` carry NO text
 * content, so the ONLY way assistive tech can name them is an explicit
 * text alternative. A media primitive with neither a label nor a
 * decorative marker is inaccessible on EVERY target — a screen reader
 * announces the file name or nothing (web), VoiceOver skips silently
 * (iOS), TalkBack reads "image" with no context (Android). Writing
 * `accessibilityLabel` once lowers to the right idiom on all three
 * (web `alt`/`aria-label`, iOS accessibility label, Android
 * contentDescription) — so this rule keeps the multiplatform a11y
 * contract honest at author time.
 *
 * Fires on `<Image>` / `<Icon>` (matched by element name — same
 * convention as every frontend rule) when NONE of these is present:
 *   - a text alternative: `accessibilityLabel` (the canonical
 *     multiplatform prop), `alt`, `aria-label`, `aria-labelledby`
 *   - a decorative marker: `accessibilityHidden`, `aria-hidden`
 *
 * Accepting `alt` / `aria-*` as satisfying — not just
 * `accessibilityLabel` — is deliberate: it means a project that ALSO
 * uses `@pyreon/zero`'s web-optimized `<Image alt>` (same element name,
 * different a11y prop) is never false-flagged, while a truly
 * label-less media primitive still fires. Presence-only, never value
 * (an explicit `accessibilityLabel=""` / `alt=""` marks it decorative,
 * exactly like `require-img-alt`).
 *
 * Does NOT target `<Button>` / `<Press>` — those derive their
 * accessible name from text children, so requiring an explicit label
 * there would false-positive on the common `<Button>Save</Button>`.
 *
 * Stays completely silent in projects that don't depend on
 * `@pyreon/primitives` (no noise, no config).
 */
const MEDIA_PRIMITIVES = new Set(['Image', 'Icon'])

const SATISFYING_ATTRS = [
  'accessibilityLabel',
  'alt',
  'aria-label',
  'aria-labelledby',
  'accessibilityHidden',
  'aria-hidden',
]

export const primitiveMediaNeedsLabel: Rule = {
  meta: {
    id: 'pyreon/primitive-media-needs-label',
    category: 'frontend',
    description:
      'In @pyreon/primitives projects, every <Image>/<Icon> needs an accessibilityLabel (or alt/aria-label), or accessibilityHidden if decorative.',
    severity: 'error',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    if (!isProjectDependency(context.getFilePath(), '@pyreon/primitives')) {
      return {}
    }

    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name
        if (!name || name.type !== 'JSXIdentifier' || !MEDIA_PRIMITIVES.has(name.name)) {
          return
        }

        const hasAlternative = SATISFYING_ATTRS.some((attr) => hasJSXAttribute(node, attr))
        if (hasAlternative) return

        context.report({
          message:
            `<${name.name}> has no accessible name — add an \`accessibilityLabel\` describing it ` +
            `(lowers to web alt/aria-label, iOS/Android a11y label), or \`accessibilityHidden\` if it is purely decorative.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
