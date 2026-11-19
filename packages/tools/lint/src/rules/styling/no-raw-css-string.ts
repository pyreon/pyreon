import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { extractImportInfo } from '../../utils/imports'
import { isProjectDependency } from '../../utils/project-deps'
import {
  attrsObjectOf,
  componentPropsOfH,
  jsxAttrExpression,
  jsxComponentRoot,
  NO_MODIFIER_SOURCES,
  propertyKey,
  rawCssTextNodes,
  SLOT_CSS_PROPS,
} from './css-prop-shared'

/**
 * Raw CSS text in an `@pyreon/elements` `css` prop: a string literal or an
 * untagged template, directly or per breakpoint. Nothing checks it (property
 * names, units, breakpoints), so it is an error. The `css` type no longer
 * accepts a string, but an `h()` call, an `as` cast or a `.attrs({ css })`
 * default still gets one through, and Element still renders it.
 *
 * Covers `css` and the slot props `contentCss` / `beforeContentCss` /
 * `afterContentCss` on a component in JSX, in `h(Component, { … })`, and in
 * a `.attrs({ … })` object. Gated on `@pyreon/elements`; components imported
 * from `@pyreon/coolgrid` are skipped (their `css` takes a string by design).
 */
const PROPS = new Set(['css', ...SLOT_CSS_PROPS])

const message = (prop: string) =>
  `Raw CSS text in \`${prop}\` is unchecked. For a look, give the component a named modifier ` +
  "(`.multiple({ look: { gridTemplateColumns: { md: 'repeat(3, 1fr)' } } })`, applied as `multiple=\"look\"`); " +
  'for a caller-chosen value, a typed param (`.params({ columns: (n: number) => ({ … }) })`, applied as `columns={3}`); ' +
  `for a selector or an at-rule, write the escape hatch as a tagged template (\`${prop}={css\`…\`}\` or \`${prop}={(css) => css\`…\`}\`).`

export const noRawCssString: Rule = {
  meta: {
    id: 'pyreon/no-raw-css-string',
    category: 'styling',
    description: 'In @pyreon/elements projects, a `css` / slot-css prop must not be a raw CSS string (unchecked text).',
    severity: 'error',
    requiresDependency: '@pyreon/elements',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (!isProjectDependency(context.getFilePath(), '@pyreon/elements')) return {}

    const exempt = new Set<string>()
    const check = (prop: string, value: any) => {
      for (const node of rawCssTextNodes(value)) context.report({ message: message(prop), span: getSpan(node) })
    }
    const checkObject = (obj: any) => {
      for (const p of obj.properties ?? []) {
        const key = propertyKey(p)
        if (key !== null && PROPS.has(key)) check(key, p.value)
      }
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
          if (attr.type === 'JSXAttribute' && attr.name?.type === 'JSXIdentifier' && PROPS.has(attr.name.name)) {
            check(attr.name.name, jsxAttrExpression(attr))
          }
        }
      },
      CallExpression(node: any) {
        const target = componentPropsOfH(node, exempt)
        if (target) {
          checkObject(target.props)
          return
        }
        const attrs = attrsObjectOf(node)
        if (attrs) checkObject(attrs)
      },
    }

    return callbacks
  },
}
