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
 *
 * Both SPELLINGS are covered. Pyreon has two ways to write a DOM element —
 * `<div>` and `h('div', …)` — and a JSX-only rule sees exactly half of them.
 * `@pyreon/primitives`' own web implementations are written entirely in `h()`,
 * so the shape is not hypothetical: a rule that reads JSX alone reports
 * nothing on a file made of nothing but DOM elements.
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

/**
 * Is this file's `h` the framework's element factory?
 *
 * Only an `h` imported from `@pyreon/core` builds a Pyreon element. A local
 * `h` — a helper, a param, a math variable — is somebody else's identifier,
 * and reporting on it would be a false positive in a rule that must stay
 * quiet on code entitled to the whole language.
 */
function importsFrameworkH(node: any): boolean {
  const source = node?.source?.value
  if (source !== '@pyreon/core' && source !== '@pyreon/runtime-dom') return false
  for (const spec of node.specifiers ?? []) {
    if (spec?.type !== 'ImportSpecifier') continue
    if (spec.imported?.name === 'h' && spec.local?.name === 'h') return true
  }
  return false
}

/** The tag name of a JSXElement's opening element, or null. */
function openingTagName(node: any): string | null {
  const name = node?.openingElement?.name
  return name?.type === 'JSXIdentifier' ? String(name.name) : null
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

    // A `<Web>` subtree is the escape hatch this rule's own message
    // recommends, so DOM tags inside one are the fix, not the defect. Depth,
    // not a boolean: `<Web>` can nest inside a component that also renders
    // portable siblings, and oxc passes no parent to work it out from.
    let webDepth = 0
    // Set by an `import { h } from '@pyreon/core'`. An `h(...)` call is only
    // an element factory once we have SEEN that import; without it the name
    // belongs to the file's author.
    let frameworkH = false

    const report = (what: string, tag: string, node: unknown) => {
      const suggestion = SUGGESTIONS[tag]
      context.report({
        message: `${what} is a DOM element, and this file has to compile for iOS and Android where there is no DOM. PMTC lowers the 15 canonical primitives from \`@pyreon/primitives\`${
          suggestion === undefined ? '' : ` — this is usually \`<${suggestion}>\``
        }. If it genuinely has to be a DOM node, put it behind a \`<Web>\` branch with native siblings.`,
        span: getSpan(node),
      })
    }

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        if (importsFrameworkH(node)) frameworkH = true
      },
      CallExpression(node: any) {
        if (!frameworkH || webDepth > 0) return
        if (node?.callee?.type !== 'Identifier' || node.callee.name !== 'h') return
        const first = node.arguments?.[0]
        // `h(Component, …)` is a component, not a DOM element — only a STRING
        // literal names an intrinsic tag, exactly as in JSX.
        if (first?.type !== 'Literal' || typeof first.value !== 'string') return
        const tag = first.value
        if (!/^[a-z]/.test(tag)) return
        report(`\`h('${tag}', …)\``, tag, node)
      },
      JSXElement(node: any) {
        if (openingTagName(node) === 'Web') webDepth++
      },
      'JSXElement:exit'(node: any) {
        if (openingTagName(node) === 'Web') webDepth--
      },
      JSXOpeningElement(node: any) {
        if (webDepth > 0) return
        const name = node?.name
        if (name?.type !== 'JSXIdentifier') return
        const tag = String(name.name)
        // Uppercase is a component — a platform branch, a canonical primitive,
        // or the author's own. Only intrinsic DOM tags are lowercase.
        if (!/^[a-z]/.test(tag)) return
        report(`\`<${tag}>\``, tag, node)
      },
    }
    return callbacks
  },
}
