/**
 * Every common way of declaring a component → a `function` declaration, for the native targets.
 *
 * The native parser recognises a component written as `function App()` or `export function App()`. The other common
 * spellings did not lower, and none of them said so:
 *
 * - `export default function App()` emitted NOTHING — the whole component vanished, with zero warnings;
 * - `const Card = (props: P) => …` became a closure (`let Card = { props in … }`) or a prop-less helper, neither of
 *   which a call site `<Card title="x" />` can construct;
 * - `const Card = function (props: P) { … }` was dropped with a warning.
 *
 * This pass rewrites them, before parsing, into the declaration form the parser already lowers. On native the
 * difference between the forms is only syntax: there is no hoisting, `this` or `arguments` to preserve, and the host
 * imports a component by NAME, so a default export loses nothing by becoming a named one.
 *
 * A top-level PascalCase `const` holding a function that contains JSX is rewritten when it is a COMPONENT: it is rendered
 * as a JSX element (`<Card …>`), or it takes a props object, or its body is a block that can hold state. A function
 * that is only CALLED (`{Row(1)}`), or a concise arrow with no parameters, is a VIEW FUNCTION and keeps its existing
 * lowering (`@ViewBuilder func` / `@Composable fun`), which is already correct for it. The pass
 * refuses, with a named warning, what it cannot rewrite faithfully: an anonymous default export (it has no name to
 * give the component), an async / generator / generic function, and a component typed on its NAME
 * (`const Card: FC<P> = (props) => …`), whose parameter type the native side cannot see.
 */

import { parseSync } from 'oxc-parser'
import { type Edit, applyEdits } from './inline-hooks'

type Node = any

export interface ComponentFormsResult {
  readonly code: string
  readonly warnings: string[]
}

const COMPONENT_NAME = /^[A-Z]/

export function normalizeComponentForms(source: string, filename: string): ComponentFormsResult | null {
  // Cheap gate: every shape this pass handles needs either a default export or a function-valued const.
  if (!/export\s+default\b|=>|\bfunction\b/.test(source)) return null
  const parsed = parseSync(filename, source, { sourceType: 'module', lang: 'tsx' })
  if (parsed.errors.length > 0) return null
  const edits: Edit[] = []
  const warnings: string[] = []
  const usage = collectUsage(parsed.program as Node)
  for (const stmt of (parsed.program as Node).body as Node[]) {
    if (stmt.type === 'ExportDefaultDeclaration') defaultExport(stmt, source, edits, warnings)
    else if (stmt.type === 'VariableDeclaration') constComponent(stmt, '', source, usage, edits, warnings)
    else if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration?.type === 'VariableDeclaration') {
      constComponent(stmt.declaration, 'export ', source, usage, edits, warnings, stmt)
    }
  }
  if (edits.length === 0 && warnings.length === 0) return null
  return { code: edits.length > 0 ? applyEdits(source, edits) : source, warnings }
}

function defaultExport(stmt: Node, source: string, edits: Edit[], warnings: string[]): void {
  const d = stmt.declaration
  if (d?.type === 'FunctionDeclaration') {
    if (!d.id) {
      if (containsJsx(d)) warnings.push(anonymous())
      return
    }
    // `export default function App()` → `export function App()`; the host imports it by name either way.
    edits.push({ start: stmt.start, end: d.start, text: 'export ' })
    return
  }
  if ((d?.type === 'ArrowFunctionExpression' || d?.type === 'FunctionExpression') && containsJsx(d)) warnings.push(anonymous())
}

function constComponent(
  decl: Node,
  prefix: string,
  source: string,
  usage: Usage,
  edits: Edit[],
  warnings: string[],
  outer: Node = decl,
): void {
  if (decl.kind !== 'const' || (decl.declarations as Node[]).length !== 1) return
  const d = decl.declarations[0]
  const fn = d.init
  if (d.id?.type !== 'Identifier' || !COMPONENT_NAME.test(d.id.name)) return
  if (fn?.type !== 'ArrowFunctionExpression' && fn?.type !== 'FunctionExpression') return
  if (!containsJsx(fn)) return
  const name = d.id.name as string
  if (!isComponent(name, fn, usage)) return
  const reason = fn.async
    ? 'it is async'
    : fn.generator
      ? 'it is a generator'
      : fn.typeParameters
        ? 'it is generic'
        : d.id.typeAnnotation
          ? `it is typed on its name (\`const ${name}: …\`); type the parameter instead (\`(props: Props) =>\`)`
          : undefined
  if (reason !== undefined) {
    warnings.push(
      `Component ${name} was not lowered to native — ${reason}. Declare it as \`function ${name}(props: Props) { … }\`.`,
    )
    return
  }
  const params = fn.params as Node[]
  const paramText = params.length === 0 ? '()' : `(${source.slice(params[0].start, params[params.length - 1].end)})`
  const returnText = fn.returnType ? source.slice(fn.returnType.start, fn.returnType.end) : ''
  const bodyText =
    fn.body.type === 'BlockStatement'
      ? source.slice(fn.body.start, fn.body.end)
      : `{ return ${source.slice(fn.body.start, fn.body.end)} }`
  edits.push({ start: outer.start, end: outer.end, text: `${prefix}function ${name}${paramText}${returnText} ${bodyText}` })
}

interface Usage {
  /** Names rendered as a JSX element: `<Card …>`. */
  readonly tags: Set<string>
  /** Names called as a function: `Row(1)`. */
  readonly calls: Set<string>
}

function isComponent(name: string, fn: Node, usage: Usage): boolean {
  const rendered = usage.tags.has(name)
  if (usage.calls.has(name) && !rendered) return false // a view function, called with positional arguments
  const params = fn.params as Node[]
  if (params.length === 0 && fn.body.type !== 'BlockStatement') return false // `@ViewBuilder func X()` already serves it
  return rendered || fn.body.type === 'BlockStatement' || takesPropsObject(params[0])
}

/** A first parameter that is a props object: a destructuring pattern, or annotated with an object or named type. */
function takesPropsObject(param: Node | undefined): boolean {
  if (!param) return false
  if (param.type === 'ObjectPattern') return true
  const t = param.type === 'Identifier' ? param.typeAnnotation?.typeAnnotation : undefined
  return t?.type === 'TSTypeLiteral' || t?.type === 'TSTypeReference'
}

function collectUsage(program: Node): Usage {
  const tags = new Set<string>()
  const calls = new Set<string>()
  const visit = (n: Node): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const c of n) visit(c)
      return
    }
    if (n.type === 'JSXOpeningElement' && n.name?.type === 'JSXIdentifier') tags.add(n.name.name)
    else if (n.type === 'CallExpression' && n.callee?.type === 'Identifier') calls.add(n.callee.name)
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') visit(n[k])
  }
  visit(program)
  return { tags, calls }
}

function containsJsx(node: Node): boolean {
  let found = false
  const visit = (n: Node): void => {
    if (found || !n || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const c of n) visit(c)
      return
    }
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
      found = true
      return
    }
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') visit(n[k])
  }
  visit(node)
  return found
}

function anonymous(): string {
  return (
    'An anonymous default-exported component was not lowered to native — the host imports a component by name, and ' +
    'this one has none. Name it: `export default function App() { … }`.'
  )
}
