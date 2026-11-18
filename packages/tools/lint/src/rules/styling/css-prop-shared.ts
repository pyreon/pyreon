/**
 * Shared AST helpers for the rules about CSS passed to a component through a
 * prop (`prefer-style-modifier`, `no-raw-css-string`, `no-theme-props-in-style`).
 */

/** Components with no theme to put a modifier on (coolgrid's `Container` / `Row` / `Col` take `css` / `rowCss` / `colCss`). */
export const NO_MODIFIER_SOURCES = new Set(['@pyreon/coolgrid'])

/** The Element slot props: CSS for the content / before / after slot, not the root. */
export const SLOT_CSS_PROPS = new Set(['contentCss', 'beforeContentCss', 'afterContentCss'])

export const isComponentName = (name: string): boolean => /^[A-Z]/.test(name)

/** The root identifier of a JSX tag name (`Foo` / `Foo.Bar` → `Foo`), or `null` for an HTML tag. */
export function jsxComponentRoot(name: any): string | null {
  if (name?.type === 'JSXIdentifier') return isComponentName(name.name) ? name.name : null
  if (name?.type === 'JSXMemberExpression') {
    let object = name.object
    while (object?.type === 'JSXMemberExpression') object = object.object
    return object?.type === 'JSXIdentifier' ? object.name : null
  }

  return null
}

/** The display name of a JSX tag (`Foo.Bar`). */
export function jsxTagName(name: any): string {
  if (name?.type === 'JSXIdentifier') return name.name
  if (name?.type === 'JSXMemberExpression') return `${jsxTagName(name.object)}.${name.property?.name ?? ''}`
  return 'Component'
}

/** A non-computed key name of an object property (`{ css: … }` / `{ 'css': … }`), else `null`. */
export function propertyKey(prop: any): string | null {
  if (prop?.type !== 'Property' || prop.computed) return null
  const key = prop.key
  if (key?.type === 'Identifier') return key.name
  if (key?.type === 'Literal' && typeof key.value === 'string') return key.value
  return null
}

/** `h(Component, { … })` with a capitalized identifier: `{ name, props }`, else `null`. */
export function componentPropsOfH(node: any, exempt: ReadonlySet<string>): { name: string; props: any } | null {
  if (node.callee?.type !== 'Identifier' || node.callee.name !== 'h') return null
  const [component, props] = node.arguments ?? []
  if (component?.type !== 'Identifier' || !isComponentName(component.name) || exempt.has(component.name)) return null

  return props?.type === 'ObjectExpression' ? { name: component.name, props } : null
}

/** `X.attrs({ … })`: the object literal argument, else `null`. */
export function attrsObjectOf(node: any): any {
  const callee = node.callee
  if (callee?.type !== 'MemberExpression' || callee.computed || callee.property?.name !== 'attrs') return null
  const [arg] = node.arguments ?? []
  return arg?.type === 'ObjectExpression' ? arg : null
}

/** The expression a JSX attribute carries (`css="…"` → the literal, `css={x}` → `x`). */
export function jsxAttrExpression(attr: any): any {
  const value = attr.value
  if (!value) return null
  return value.type === 'JSXExpressionContainer' ? value.expression : value
}

/** Strip a TS `as` / `satisfies` / non-null wrapper (`'x' as never`). */
export function unwrapTs(node: any): any {
  let n = node
  while (n && (n.type === 'TSAsExpression' || n.type === 'TSSatisfiesExpression' || n.type === 'TSNonNullExpression' || n.type === 'TSTypeAssertion' || n.type === 'ParenthesizedExpression')) {
    n = n.expression
  }
  return n
}

/**
 * Every raw CSS text node inside a `css`-prop value: a string literal or an
 * UNTAGGED template literal, directly or inside a per-breakpoint object /
 * array, through `as` casts. A tagged template (`css\`…\``) or a callback is
 * not raw text.
 */
export function rawCssTextNodes(value: any): any[] {
  const out: any[] = []
  const walk = (node: any): void => {
    const n = unwrapTs(node)
    if (!n) return
    if (n.type === 'Literal' && typeof n.value === 'string') out.push(n)
    else if (n.type === 'TemplateLiteral') out.push(n)
    else if (n.type === 'ConditionalExpression') {
      walk(n.consequent)
      walk(n.alternate)
    } else if (n.type === 'LogicalExpression') walk(n.right)
    else if (n.type === 'ArrayExpression') for (const el of n.elements ?? []) walk(el)
    else if (n.type === 'ObjectExpression') for (const p of n.properties ?? []) if (p.type === 'Property') walk(p.value)
  }
  walk(value)
  return out
}
