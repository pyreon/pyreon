import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { extractImportInfo } from '../../utils/imports'
import { isProjectDependency } from '../../utils/project-deps'
import {
  componentPropsOfH,
  jsxAttrExpression,
  jsxComponentRoot,
  jsxTagName,
  NO_MODIFIER_SOURCES,
  propertyKey,
  rawCssTextNodes,
  unwrapTs,
} from './css-prop-shared'

/**
 * No styles through props. A one-off look of a rocketstyle component is a
 * named, typed modifier on the component (`.multiple({ threeUp: { … } })`),
 * applied by name (`<Grid multiple="threeUp" />`); it goes through the theme
 * pipeline, so it is type-checked, composes, and cannot lose to `.theme()`.
 * A caller-chosen value is a typed prop of the component; a product-wide look
 * is a variant. The `css` prop stays as the escape hatch for a selector or an
 * at-rule a theme value cannot express; this rule flags every use on a
 * component so each one carries a suppression comment with its reason.
 *
 * Not an autofix: the fix edits the component's DEFINITION (often another
 * file) and turns CSS text into unistyle keys (`border-top-width` is
 * `borderWidthTop`), neither of which is safe to do blindly. The message
 * carries the snippet to add instead, built from the declarations when the
 * `css` is a plain `css\`…\`` template.
 *
 * Gated on the project declaring `@pyreon/elements`. Not flagged: `css` on an
 * HTML element; components imported from `@pyreon/coolgrid` (no theme); the
 * slot props `contentCss` / `beforeContentCss` / `afterContentCss` (they style
 * an inner slot, which a root theme slice cannot reach); and a raw string
 * value, which `pyreon/no-raw-css-string` reports as an error.
 */
const toCamel = (prop: string): string => prop.trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

/** `{ gridTemplateColumns: 'repeat(3, 1fr)' }` from `css\`grid-template-columns: repeat(3, 1fr);\``, else `null`. */
function declarationsOf(value: any): string | null {
  const v = unwrapTs(value)
  if (v?.type !== 'TaggedTemplateExpression') return null
  const quasi = v.quasi
  if (!quasi || (quasi.expressions?.length ?? 0) > 0) return null
  const text: string = quasi.quasis?.[0]?.value?.cooked ?? ''
  if (/[{}@&]/.test(text)) return null
  const entries = text
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const i = d.indexOf(':')
      return i > 0 ? `${toCamel(d.slice(0, i))}: ${JSON.stringify(d.slice(i + 1).trim()).replace(/"/g, "'")}` : null
    })
  if (entries.length === 0 || entries.some((e) => e === null)) return null

  return `{ ${entries.join(', ')} }`
}

function message(tag: string, value: any): string {
  const body = declarationsOf(value) ?? '{ /* the declarations, as .theme() keys */ }'
  return (
    `\`css\` on <${tag}> passes CSS through a prop. Give the component a named modifier and apply it by name: ` +
    `\`const Styled = ${tag}.multiple({ look: ${body} })\` then \`<Styled multiple="look" />\` ` +
    "(compose with `multiple={['look', cond && 'other']}`). Keys are unistyle's (`borderWidthTop`), values may be responsive (`{ md: … }`). " +
    'A caller-chosen value belongs in a typed prop of the component; a product-wide look in `.variants()`. ' +
    'Keep `css` only for a selector or an at-rule, with `// pyreon-lint-disable-next-line pyreon/prefer-style-modifier` and the reason.'
  )
}

export const preferStyleModifier: Rule = {
  meta: {
    id: 'pyreon/prefer-style-modifier',
    category: 'styling',
    description:
      'In @pyreon/elements projects, give a component a named `.multiple()` modifier instead of passing `css` to it; `css` is the escape hatch for a selector or an at-rule.',
    severity: 'warn',
    requiresDependency: '@pyreon/elements',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (!isProjectDependency(context.getFilePath(), '@pyreon/elements')) return {}

    // Local names bound to components that have no theme to put a modifier on.
    const exempt = new Set<string>()
    const check = (node: any, tag: string, value: any) => {
      // A raw string is `pyreon/no-raw-css-string`'s (an error, not this warning).
      const raw = rawCssTextNodes(value)
      if (raw.length > 0 && raw.length === countLeaves(value)) return
      context.report({ message: message(tag, value), span: getSpan(node) })
    }

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const info = extractImportInfo(node)
        if (!info || !NO_MODIFIER_SOURCES.has(info.source)) return
        for (const s of info.specifiers) exempt.add(s.local)
      },
      JSXOpeningElement(node: any) {
        const root = jsxComponentRoot(node.name)
        if (root === null || exempt.has(root)) return

        for (const attr of node.attributes ?? []) {
          if (attr.type === 'JSXAttribute' && attr.name?.type === 'JSXIdentifier' && attr.name.name === 'css') {
            check(attr, jsxTagName(node.name), jsxAttrExpression(attr))
          }
        }
      },
      CallExpression(node: any) {
        const target = componentPropsOfH(node, exempt)
        if (!target) return
        for (const prop of target.props.properties ?? []) if (propertyKey(prop) === 'css') check(prop, target.name, prop.value)
      },
    }

    return callbacks
  },
}

/** How many value leaves a `css` value has (to tell an all-raw-text value from a mixed one). */
function countLeaves(value: any): number {
  const n = unwrapTs(value)
  if (!n) return 0
  if (n.type === 'ArrayExpression') return (n.elements ?? []).reduce((s: number, e: any) => s + countLeaves(e), 0)

  if (n.type === 'ObjectExpression') {
    return (n.properties ?? []).reduce((s: number, p: any) => s + (p.type === 'Property' ? countLeaves(p.value) : 1), 0)
  }

  if (n.type === 'ConditionalExpression') return countLeaves(n.consequent) + countLeaves(n.alternate)
  if (n.type === 'LogicalExpression') return countLeaves(n.right)

  return 1
}
