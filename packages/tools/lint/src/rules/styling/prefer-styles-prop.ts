import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { extractImportInfo } from '../../utils/imports'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * `@pyreon/elements` components (`Element`, `Text` and every rocketstyle
 * component built on them) take a typed per-instance override, `styles`: the
 * same keys and value shapes as a component's `.theme()`, checked by the type
 * checker. The `css` prop is the escape hatch for what that object cannot
 * express (a selector, an at-rule), written as a `css\`…\`` template. This rule
 * flags `css` on a component so a reviewer sees each use of the escape hatch;
 * a deliberate one takes a suppression comment with its reason.
 *
 * Gated on the project declaring `@pyreon/elements` (another library's `css`
 * prop, such as Emotion's, is not this one). Not flagged:
 *  - `css` on an HTML element (`<div css>`) — not a component prop;
 *  - components imported from `@pyreon/coolgrid` (`Container` / `Row` / `Col`
 *    take `css` / `rowCss` / `colCss` and have no typed override);
 *  - the slot props `contentCss` / `beforeContentCss` / `afterContentCss`,
 *    which have no typed equivalent yet.
 * Both JSX (`<Card css={…}>`) and `h(Card, { css: … })` are checked.
 */
const NO_TYPED_OVERRIDE_SOURCES = new Set(['@pyreon/coolgrid'])

const MESSAGE =
  '`css` is the escape hatch for CSS the typed override cannot express. Use the typed `styles` prop instead — ' +
  "the same keys and value shapes as `.theme()`, e.g. `styles={{ gridTemplateColumns: { md: 'repeat(3, 1fr)' }, hover: { color: 'red' } }}`. " +
  'Keep `css` only for a selector or an at-rule, with a `// pyreon-lint-ignore pyreon/prefer-styles-prop` comment saying why.'

const isComponentName = (name: string): boolean => /^[A-Z]/.test(name)

/** The root identifier of a JSX tag name (`Foo` / `Foo.Bar` → `Foo`), or `null` for an HTML tag. */
function jsxComponentRoot(name: any): string | null {
  if (name?.type === 'JSXIdentifier') return isComponentName(name.name) ? name.name : null
  if (name?.type === 'JSXMemberExpression') {
    let object = name.object
    while (object?.type === 'JSXMemberExpression') object = object.object
    return object?.type === 'JSXIdentifier' ? object.name : null
  }

  return null
}

export const preferStylesProp: Rule = {
  meta: {
    id: 'pyreon/prefer-styles-prop',
    category: 'styling',
    description:
      'In @pyreon/elements projects, prefer the typed `styles` override (the `.theme()` object shape) over the `css` escape hatch on a component.',
    severity: 'warn',
    requiresDependency: '@pyreon/elements',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (!isProjectDependency(context.getFilePath(), '@pyreon/elements')) return {}

    // Local names bound to components that have no typed override.
    const exempt = new Set<string>()
    const report = (node: any) => context.report({ message: MESSAGE, span: getSpan(node) })

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const info = extractImportInfo(node)
        if (!info || !NO_TYPED_OVERRIDE_SOURCES.has(info.source)) return
        for (const s of info.specifiers) exempt.add(s.local)
      },
      JSXOpeningElement(node: any) {
        const root = jsxComponentRoot(node.name)
        if (root === null || exempt.has(root)) return
        for (const attr of node.attributes ?? []) {
          if (attr.type === 'JSXAttribute' && attr.name?.type === 'JSXIdentifier' && attr.name.name === 'css') report(attr)
        }
      },
      CallExpression(node: any) {
        if (node.callee?.type !== 'Identifier' || node.callee.name !== 'h') return
        const [component, props] = node.arguments ?? []
        if (component?.type !== 'Identifier' || !isComponentName(component.name) || exempt.has(component.name)) return
        if (props?.type !== 'ObjectExpression') return
        for (const prop of props.properties ?? []) {
          const key = prop.key
          const isCss =
            prop.type === 'Property' &&
            !prop.computed &&
            ((key?.type === 'Identifier' && key.name === 'css') || (key?.type === 'Literal' && key.value === 'css'))
          if (isCss) report(prop)
        }
      },
    }

    return callbacks
  },
}
