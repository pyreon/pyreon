import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPortablePath, portablePathsFrom } from '../../utils/portable-paths'

/**
 * A raw DOM element in a file that has to reach iOS and Android.
 *
 * PMTC lowers a fixed vocabulary — the 15 canonical primitives — into SwiftUI
 * views and Compose composables. A `<div>` has no such mapping, because there
 * is nothing on either target that a div corresponds to; the compiler either
 * warns and drops it or bails on the file.
 *
 * The mapping below is the common cases, and it is a SUGGESTION rather than a
 * translation: `<div>` is usually `<Stack>` but is sometimes `<Inline>` or
 * `<Layer>`, and only the author knows which. The rule's job is to say "this
 * will not cross", not to pick.
 *
 * `@pyreon/elements` components are flagged for the same reason one layer up —
 * they are built on the styler stack, which is web-only by architecture.
 */
const SUGGESTIONS: Record<string, string> = {
  div: 'Stack (column) or Inline (row)',
  span: 'Text',
  p: 'Text',
  h1: 'Heading',
  h2: 'Heading',
  h3: 'Heading',
  h4: 'Heading',
  h5: 'Heading',
  h6: 'Heading',
  button: 'Button',
  a: 'Link',
  img: 'Image',
  input: 'Field',
  section: 'Stack',
  article: 'Stack',
  header: 'Stack',
  footer: 'Stack',
  main: 'Stack',
  nav: 'Stack',
  ul: 'Stack',
  ol: 'Stack',
  li: 'Stack',
  form: 'Stack',
  label: 'Text',
  strong: 'Text',
  em: 'Text',
  small: 'Text',
}

export const preferCanonicalPrimitive: Rule = {
  meta: {
    id: 'pyreon/prefer-canonical-primitive',
    category: 'portable',
    description:
      'A raw DOM element in portable source — PMTC lowers only the 15 canonical primitives, and a `<div>` has no SwiftUI or Compose counterpart to lower to.',
    severity: 'warn',
    optIn: true,
    fixable: false,
    schema: { portablePaths: 'string[]' },
  },
  create(context) {
    const paths = portablePathsFrom(context)
    if (!isPortablePath(context.getFilePath(), paths)) return {}

    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node?.name
        if (name?.type !== 'JSXIdentifier') return
        const tag = String(name.name)
        // Uppercase is a component — a platform branch, a canonical primitive,
        // or the author's own. Only intrinsic DOM tags are lowercase.
        if (!/^[a-z]/.test(tag)) return
        const suggestion = SUGGESTIONS[tag]
        context.report({
          message: `\`<${tag}>\` is a DOM element, and this file has to compile for iOS and Android where there is no DOM. PMTC lowers the 15 canonical primitives from \`@pyreon/primitives\`${
            suggestion === undefined ? '' : ` — this is usually \`<${suggestion}>\``
          }. If it genuinely has to be a DOM node, put it behind a \`<Web>\` branch with native siblings.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
