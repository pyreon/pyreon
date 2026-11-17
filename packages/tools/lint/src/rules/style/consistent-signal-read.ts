import { visitorKeys } from 'oxc-parser'
import { detectPlain } from '@pyreon/compiler/plain'
import type { Rule, VisitorCallbacks } from '../../types'
import { isCompiledByPyreon } from '../../utils/compiled-by-pyreon'
import { collectSignalBindings } from '../../utils/signal-bindings'

/**
 * `pyreon/consistent-signal-read` — read a signal the same way everywhere.
 *
 * The JSX compiler auto-calls a bare known signal (`{count}` → `count()`), so
 * inside a JSX expression `count` and `count()` usually compile to the same
 * code. The two forms are still not interchangeable:
 *
 * - The auto-call covers only JSX expressions and only `const x = signal()` /
 *   `computed()` names the compiler can see (plus imports the Vite plugin
 *   registers). An object field, a store or hook result, a `<For>` row item, a
 *   parameter or a destructured name is never auto-called.
 * - TypeScript types a bare signal as the signal, so `count > 0`, `count + 1`,
 *   `style={{ color }}` values and component props typed `string`/`number` are
 *   type errors in the bare form.
 *
 * `form: 'called'` (the default) asks for `count()` wherever the compiler would
 * otherwise auto-call, and autofixes it (inserting `()` cannot change the
 * compiled output there). That includes a bare signal inside a function nested
 * in JSX (an event handler, a `ref`, a render callback): the compiler reads it
 * there on every element path, so both forms compile to the same code. The
 * one read left to the author is the whole value of a component prop (below).
 *
 * `form: 'bare'` asks for `{count}` only where the bare form is type-safe and
 * compiles identically: as the WHOLE expression of a JSX child or of an
 * attribute on a DOM element (not `on*` or `ref`). Everywhere else the call is
 * required, so the rule says nothing.
 *
 * Skipped: Plain Mode files (there the bare name IS the read); files the Pyreon
 * compiler does not lower — test files (vitest's own JSX transform), compat
 * projects and a foreign `@jsxImportSource` — because there `{count}` is a live
 * accessor and `{count()}` is read once; names bound more than once in the file (the
 * collection is scope-blind), object shorthand `{ count }` and spreads (the
 * compiler passes the signal itself there), and `on*` / `ref` attribute values.
 */

type Node = any

const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
])

const TRANSPARENT = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ChainExpression',
])

/** `onClick`, or `xlink:href` for a namespaced attribute. */
function attrName(attr: Node): string {
  const n = attr.name

  return n.type === 'JSXIdentifier' ? n.name : `${n.namespace.name}:${n.name.name}`
}

const isHandlerOrRef = (name: string): boolean => name === 'ref' || /^on[A-Z]/.test(name)

function isIntrinsicElement(opening: Node): boolean {
  const n = opening?.name
  return n?.type === 'JSXIdentifier' && /^[a-z]/.test(n.name)
}

const CONTROL_FLOW = new Set(['Show', 'For', 'Match', 'Switch'])

function isControlFlow(opening: Node): boolean {
  const n = opening?.name
  return n?.type === 'JSXIdentifier' && CONTROL_FLOW.has(n.name)
}

/** Walk with the ancestor stack. */
function walk(node: Node, stack: Node[], visit: (n: Node, stack: Node[]) => void): void {
  // Array holes (`[a, , b]`) and absent optional children are null.
  if (node === null) return
  visit(node, stack)
  stack.push(node)
  for (const key of visitorKeys[node.type] ?? []) {
    const child = node[key]
    if (Array.isArray(child)) {
      for (const item of child) walk(item, stack, visit)
    } else if (child && typeof child.type === 'string') {
      walk(child, stack, visit)
    }
  }
  stack.pop()
}

interface Zone {
  container: Node
  owner: Node
  nested: boolean
}

/** One read of a known signal in JSX, with everything the two forms decide on. */
interface Site {
  node: Node
  /** The reference including parentheses and type layers around it. */
  outer: Node
  /** The expression that uses `outer` (the call, for `count()`). */
  user: Node
  isCall: boolean
  zone: Zone
  stack: Node[]
}

type Report = (d: {
  message: string
  span: { start: number; end: number }
  fix?: { span: { start: number; end: number }; replacement: string }
}) => void

/** Uses that are neither a bare read nor a called read: API, identity, writes. */
function isNeitherForm(user: Node, outer: Node): boolean {
  switch (user.type) {
    case 'MemberExpression':
      return user.object === outer // `count.set(…)`, `count.peek()`
    case 'Property':
      return user.shorthand === true // `{ count }` passes the signal itself
    case 'SpreadElement':
    case 'JSXSpreadAttribute':
    case 'UpdateExpression':
      return true
    case 'AssignmentExpression':
      return user.left === outer
    case 'UnaryExpression':
      return user.operator === 'typeof'
    case 'CallExpression':
      // `sig(v)` is another rule's job; `sig?.()` / `sig<T>()` are left alone.
      return (
        user.callee === outer &&
        ((user.arguments?.length ?? 0) > 0 || user.optional === true || user.typeArguments != null)
      )
  }

  return false
}

/**
 * Where an identifier sits relative to JSX: `null` outside any JSX expression,
 * otherwise the nearest container, whether a function boundary lies between
 * them, and the attribute (if any) that owns the container.
 */
function jsxZone(stack: Node[], from: number): Zone | null {
  let nested = false
  // stack[0] is the Program, so the walk up always ends in a return.
  for (let i = from; ; i--) {
    const n = stack[i]
    if (n.type === 'JSXExpressionContainer') return { container: n, owner: stack[i - 1], nested }
    if (FUNCTION_TYPES.has(n.type)) nested = true
    // A class body inside JSX is code, not a template position.
    if (n.type === 'ClassBody' || n.type === 'Program') return null
  }
}

function readSite(node: Node, stack: Node[]): Site | null {
  const parent = stack[stack.length - 1]
  if (!parent || !isValueReference(node, parent)) return null
  // Climb through parentheses and type layers to the expression that uses it.
  let outer = node
  let at = stack.length - 1
  while (at >= 0 && TRANSPARENT.has(stack[at].type)) {
    outer = stack[at]
    at--
  }
  const user = stack[at]
  if (!user || isNeitherForm(user, outer)) return null
  const zone = jsxZone(stack, at)
  if (!zone) return null
  const isCall = user.type === 'CallExpression' && user.callee === outer

  return { node, outer, user, isCall, zone, stack }
}

function openingOf(site: Site): Node {
  return site.stack.find(
    (n, i) => n.type === 'JSXOpeningElement' && site.stack[i + 1] === site.zone.owner,
  )
}

function checkCalled(site: Site, report: Report): void {
  const { node, zone } = site
  const name = node.name
  const span = { start: node.start, end: node.end }
  if (site.isCall) return
  if (zone.nested) {
    report({
      message: `Read the signal as \`${name}()\`. Inside a function in JSX the compiler reads the bare form too, on every element, so the code is the same; \`${name}()\` also type-checks and works outside JSX. To pass the signal itself, use \`{ ${name} }\` or build the function outside the JSX.`,
      span,
      fix: { span: { start: node.end, end: node.end }, replacement: '()' },
    })

    return
  }
  const onAttr = zone.owner.type === 'JSXAttribute'
  if (onAttr && isHandlerOrRef(attrName(zone.owner))) return
  // The whole value of a component prop: on native targets PMTC reads
  // `<Field value={draft}>` as a two-way binding (`$draft`), and the called
  // form emits a different (get/set) binding. Report it, but leave the edit to
  // the author. Control-flow props lower the same either way.
  if (onAttr && zone.container.expression === site.outer) {
    const opening = openingOf(site)
    if (!isIntrinsicElement(opening) && !isControlFlow(opening)) {
      report({
        message: `Read the signal as \`${name}()\`. Not auto-fixed: on iOS and Android a bare signal on a component prop can be a two-way binding (\`<Field value={draft}>\`), which the called form emits differently.`,
        span,
      })

      return
    }
  }
  report({
    message: `Read the signal as \`${name}()\`. The compiler emits the same code for the bare form here, but \`${name}()\` also type-checks in expressions and props, works outside JSX, and keeps snippets copy-paste safe.`,
    span,
    fix: { span: { start: node.end, end: node.end }, replacement: '()' },
  })
}

/**
 * `form: 'bare'`: only `{count()}` as the WHOLE expression of a child or of a
 * DOM attribute, where `{count}` is type-safe and compiles to the same binding.
 */
function checkBare(site: Site, report: Report): void {
  const { user, zone } = site
  if (!site.isCall || zone.nested || zone.container.expression !== user) return
  // The container's owner is an attribute, or an element / fragment (a child).
  const owner = zone.owner
  if (owner.type === 'JSXAttribute') {
    if (isHandlerOrRef(attrName(owner)) || !isIntrinsicElement(openingOf(site))) return
  }
  report({
    message: `Read the signal as \`{${site.node.name}}\`. The compiler auto-calls a bare signal here and emits the same binding.`,
    span: { start: user.start, end: user.end },
    fix: { span: { start: site.outer.end, end: user.end }, replacement: '' },
  })
}

export const consistentSignalRead: Rule = {
  meta: {
    id: 'pyreon/consistent-signal-read',
    category: 'style',
    description:
      'Read a signal the same way in JSX: `count()` (default, autofixable) or, with `form: "bare"`, `{count}` where the compiler auto-calls it and the bare form type-checks.',
    severity: 'info',
    fixable: true,
    optIn: true,
    skipGenerated: true,
    schema: { form: 'string' },
  },
  create(context) {
    const check = context.getOptions().form === 'bare' ? checkBare : checkCalled
    const file = context.getFilePath().replace(/\\/g, '/')
    const report: Report = (d) => context.report(d)

    const callbacks: VisitorCallbacks = {
      Program(program: Node) {
        const source = context.getSourceText()
        if (!source.includes('<') || detectPlain(source)) return
        if (!isCompiledByPyreon(file, source)) return
        const { signals, otherBound } = collectSignalBindings(program)
        const known = new Set([...signals].filter((n) => !otherBound.has(n)))
        if (known.size === 0) return

        walk(program, [], (node, stack) => {
          if (node.type !== 'Identifier' || !known.has(node.name)) return
          const site = readSite(node, stack)
          if (site) check(site, report)
        })
      },
    }

    return callbacks
  },
}

/** `node` (an Identifier) is a value reference, not a declaration, key or type. */
function isValueReference(node: Node, parent: Node): boolean {
  switch (parent.type) {
    case 'VariableDeclarator':
      return parent.init === node
    case 'MemberExpression':
      return parent.object === node || parent.computed === true
    case 'Property':
      return parent.value === node || parent.computed === true
    case 'PropertyDefinition':
    case 'MethodDefinition':
      return parent.value === node || parent.computed === true
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return false
  }
  if (parent.type.startsWith('TS') && !TRANSPARENT.has(parent.type)) return false
  if (parent.type.startsWith('Import') || parent.type.startsWith('Export')) return false
  if (FUNCTION_TYPES.has(parent.type)) return parent.body === node

  return true
}
