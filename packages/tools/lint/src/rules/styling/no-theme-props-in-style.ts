import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { extractImportInfo } from '../../utils/imports'
import { isProjectDependency } from '../../utils/project-deps'
import { jsxComponentRoot, jsxTagName, propertyKey, unwrapTs } from './css-prop-shared'

/**
 * An inline `style={{ … }}` on a rocketstyle / Element component that sets a
 * layout or theme-owned property to a FIXED value: the same habit as passing
 * CSS through `css`, by another door (no breakpoints, no theme tokens, no
 * dark mode, and it beats every layer). The fix is the same: a named
 * `.multiple()` modifier, a typed prop of the component, or a variant.
 *
 * Precise on purpose, and opt-in: it fires only when
 *  - the tag is a component known to be themeable: imported from
 *    `@pyreon/elements` or `@pyreon/ui-components`, or declared in the file by
 *    a rocketstyle chain (`const Card = el.config(…).theme(…)`); and
 *  - the property is layout or theme-owned (below) and its value is a literal
 *    (a string or number, or a template without expressions).
 * A computed value (a transform from a gesture, a measured size, a signal)
 * and a custom property (`--x`) are never flagged.
 */
const THEMEABLE_SOURCES = new Set(['@pyreon/elements', '@pyreon/ui-components'])

const CHAIN_METHODS = new Set(['config', 'attrs', 'theme', 'states', 'sizes', 'variants', 'multiple', 'modifiers', 'styles'])

const THEME_OWNED = new Set([
  'display', 'flexDirection', 'flexWrap', 'alignItems', 'alignContent', 'alignSelf', 'justifyContent', 'justifyItems',
  'gap', 'rowGap', 'columnGap', 'gridTemplateColumns', 'gridTemplateRows', 'gridTemplateAreas',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'paddingInline', 'paddingBlock',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'marginInline', 'marginBlock',
  'color', 'background', 'backgroundColor', 'border', 'borderColor', 'borderWidth', 'borderStyle', 'borderRadius',
  'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
  'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'textAlign', 'textTransform', 'boxShadow',
])

/** A rocketstyle chain: `el.config(…).theme(…)`, `rs({ … }).attrs(…)`. */
function isRocketstyleChain(init: any): boolean {
  let n = unwrapTs(init)

  while (n?.type === 'CallExpression') {
    const callee = n.callee
    if (callee?.type === 'MemberExpression' && !callee.computed && CHAIN_METHODS.has(callee.property?.name)) return true
    n = callee?.type === 'MemberExpression' ? callee.object : null
  }

  return false
}

const isLiteralValue = (value: any): boolean => {
  const v = unwrapTs(value)
  if (v?.type === 'Literal') return typeof v.value === 'string' || typeof v.value === 'number'
  if (v?.type === 'UnaryExpression' && v.operator === '-') return isLiteralValue(v.argument)

  return v?.type === 'TemplateLiteral' && (v.expressions?.length ?? 0) === 0
}

export const noThemePropsInStyle: Rule = {
  meta: {
    id: 'pyreon/no-theme-props-in-style',
    category: 'styling',
    description:
      'An inline `style` on a rocketstyle / Element component must not set a layout or theme-owned property to a fixed value; use a `.multiple()` modifier, a typed prop or a variant.',
    severity: 'warn',
    requiresDependency: '@pyreon/elements',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (!isProjectDependency(context.getFilePath(), '@pyreon/elements')) return {}

    const themeable = new Set<string>()

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const info = extractImportInfo(node)
        if (!info || !THEMEABLE_SOURCES.has(info.source)) return
        for (const s of info.specifiers) themeable.add(s.local)
      },
      VariableDeclarator(node: any) {
        if (node.id?.type === 'Identifier' && isRocketstyleChain(node.init)) themeable.add(node.id.name)
      },
      JSXOpeningElement(node: any) {
        const root = jsxComponentRoot(node.name)
        if (root === null || !themeable.has(root)) return

        for (const attr of node.attributes ?? []) {
          if (attr.type !== 'JSXAttribute' || attr.name?.name !== 'style') continue
          const expr = unwrapTs(attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : null)
          if (expr?.type !== 'ObjectExpression') continue
          const owned = (expr.properties ?? [])
            .filter((p: any) => {
              const key = propertyKey(p)
              return key !== null && THEME_OWNED.has(key) && isLiteralValue(p.value)
            })
            .map((p: any) => propertyKey(p))
          if (owned.length === 0) continue
          const tag = jsxTagName(node.name)
          context.report({
            message:
              `Inline \`style\` on <${tag}> sets ${owned.map((k: string) => `\`${k}\``).join(', ')}, which the theme owns. ` +
              `Give the component a named modifier (\`${tag}.multiple({ look: { ${owned[0]}: … } })\`, applied as \`multiple="look"\`), ` +
              `a typed param (\`${tag}.params({ value: (v) => ({ ${owned[0]}: v }) })\`), or a variant. Inline style stays for computed values (a transform, a measured size).`,
            span: getSpan(attr),
          })
        }
      },
    }

    return callbacks
  },
}
