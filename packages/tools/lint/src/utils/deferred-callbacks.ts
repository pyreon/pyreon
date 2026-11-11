/**
 * Functions that can only run in response to a browser EVENT, never while a
 * component renders on the server.
 *
 * Server rendering calls a component body and the synchronous helpers it
 * calls. It never dispatches a DOM event, never calls a `ref`, and never fires
 * a library's `on*` callback (`onSuccess`, `onError`, `onChange` — those are
 * the library's own event hooks). So a browser global inside such a function
 * cannot fail during SSR, and an SSR rule that reports it is wrong.
 *
 * A function counts as event-only when it is:
 *
 *   1. the value of a JSX `on*` attribute or `ref`
 *      (`<button onClick={() => …}>`, `ref={(el) => …}`);
 *   2. the value of an `on*` property in an object literal
 *      (`useForm({ onSuccess: () => … })`);
 *   3. a local function (`const go = () => …` / `function go() {}`) whose
 *      every reference is in one of those positions, or inside a function that
 *      is already event-only — `<button onClick={go}>`, or a helper only ever
 *      called from a handler. Resolved to a fixpoint.
 *
 * What is deliberately NOT here: `setTimeout`, `queueMicrotask`, `.then`,
 * `new Promise`. Those run on the server too when the component body schedules
 * them, so a browser global inside them really does fail there. A local
 * function referenced anywhere else (called from the body, passed to
 * something unknown, exported) stays analysed as code that may run during SSR.
 * A name bound more than once in the file is never treated as event-only, since
 * the references cannot be told apart by name.
 */
import { visitorKeys } from 'oxc-parser'

const EVENT_PROP = /^on[A-Z]/

function isFunctionNode(n: any): boolean {
  return (
    n?.type === 'ArrowFunctionExpression' ||
    n?.type === 'FunctionExpression' ||
    n?.type === 'FunctionDeclaration'
  )
}

function unwrap(n: any): any {
  let x = n
  while (
    x &&
    (x.type === 'ParenthesizedExpression' ||
      x.type === 'TSAsExpression' ||
      x.type === 'TSSatisfiesExpression' ||
      x.type === 'TSNonNullExpression')
  ) {
    x = x.expression
  }
  return x
}

/** The expression in an event slot (`onClick={x}`, `{ onSuccess: x }`), or null. */
function eventSlotValue(node: any): any {
  if (node.type === 'JSXAttribute') {
    const name = node.name?.type === 'JSXIdentifier' ? node.name.name : null
    if (!name || !(EVENT_PROP.test(name) || name === 'ref')) return null
    const v = node.value
    if (v?.type !== 'JSXExpressionContainer') return null
    return unwrap(v.expression)
  }
  if (node.type === 'Property' && !node.computed && node.kind === 'init') {
    const key = node.key
    const name = key?.type === 'Identifier' ? key.name : key?.type === 'Literal' ? String(key.value) : null
    if (!name || !EVENT_PROP.test(name)) return null
    return unwrap(node.value)
  }
  return null
}

interface Reference {
  /** The identifier itself sits directly in an event slot. */
  inEventSlot: boolean
  /** Enclosing function nodes, innermost last. */
  enclosing: any[]
}

/**
 * Compute the event-only function nodes of a program. One walk over the AST
 * plus a fixpoint over local function bindings.
 */
export function collectEventOnlyFunctions(program: any): WeakSet<object> {
  const eventOnly = new WeakSet<object>()
  /** name → function node; `null` when the name is bound more than once. */
  const bindings = new Map<string, any | null>()
  const references = new Map<string, Reference[]>()
  /** Identifier nodes that are bindings or keys, not references. */
  const notReferences = new WeakSet<object>()
  const slotIdentifiers = new WeakSet<object>()
  const exported = new Set<string>()

  const bind = (name: string, fn: any) => {
    bindings.set(name, bindings.has(name) ? null : fn)
  }

  const walk = (node: any, fns: any[]): void => {
    if (!node || typeof node.type !== 'string') return

    const slot = eventSlotValue(node)
    if (slot) {
      if (isFunctionNode(slot)) eventOnly.add(slot)
      else if (slot.type === 'Identifier') slotIdentifiers.add(slot)
    }

    switch (node.type) {
      case 'VariableDeclarator': {
        if (node.id?.type === 'Identifier') {
          notReferences.add(node.id)
          const init = unwrap(node.init)
          bind(node.id.name, isFunctionNode(init) ? init : null)
        }
        break
      }
      case 'FunctionDeclaration':
        if (node.id?.type === 'Identifier') {
          notReferences.add(node.id)
          bind(node.id.name, node)
        }
        break
      case 'ExportNamedDeclaration':
      case 'ExportDefaultDeclaration': {
        // An exported function can be called from another module, during SSR
        // for all this file can tell — never event-only.
        const d = node.declaration
        if (d?.type === 'FunctionDeclaration' && d.id) exported.add(d.id.name)
        if (d?.type === 'VariableDeclaration') {
          for (const v of d.declarations ?? []) if (v.id?.type === 'Identifier') exported.add(v.id.name)
        }
        for (const sp of node.specifiers ?? []) if (sp.local?.type === 'Identifier') exported.add(sp.local.name)
        if (node.type === 'ExportDefaultDeclaration' && node.declaration?.type === 'Identifier') {
          exported.add(node.declaration.name)
        }
        break
      }
      case 'MemberExpression':
        if (!node.computed && node.property) notReferences.add(node.property)
        break
      case 'Property':
      case 'MethodDefinition':
      case 'PropertyDefinition':
        if (!node.computed && node.key) notReferences.add(node.key)
        break
      case 'Identifier':
        if (!notReferences.has(node)) {
          const list = references.get(node.name) ?? []
          list.push({ inEventSlot: slotIdentifiers.has(node), enclosing: fns })
          references.set(node.name, list)
        }
        return
    }

    const nextFns = isFunctionNode(node) ? [...fns, node] : fns
    const keys = visitorKeys[node.type]
    if (!keys) return
    for (const key of keys) {
      const child = node[key]
      if (Array.isArray(child)) for (const c of child) walk(c, nextFns)
      else if (child && typeof child.type === 'string') walk(child, nextFns)
    }
  }
  walk(program, [])
  for (const name of exported) bindings.set(name, null)

  const isDeferred = (ref: Reference, self: any): boolean => {
    if (ref.inEventSlot) return true
    for (const fn of ref.enclosing) if (fn === self || eventOnly.has(fn)) return true
    return false
  }

  let changed = true
  while (changed) {
    changed = false
    for (const [name, fn] of bindings) {
      if (!fn || eventOnly.has(fn)) continue
      // A self-reference (recursion) does not make a function reachable from
      // the render path; it is only reached if something else reaches it.
      const refs = (references.get(name) ?? []).filter((r) => !r.enclosing.includes(fn))
      if (refs.length === 0) continue
      if (refs.every((r) => isDeferred(r, fn))) {
        eventOnly.add(fn)
        changed = true
      }
    }
  }
  return eventOnly
}
