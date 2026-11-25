import { visitorKeys } from 'oxc-parser'
import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

/**
 * A keyed `<For>` row that reads a field of its item while the same file
 * replaces items under the same key.
 *
 * On the web `<For each={items} by={(t) => t.id}>` runs a row's callback once
 * per key. `items.set(items().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))`
 * keeps the key, so the row is kept and `{t.done ? …}` / `class={t.done ? …}` /
 * `<Row todo={t} />` + `props.todo.done` show the value the row mounted with.
 * iOS and Android redraw the row, so only the web goes stale.
 *
 * Fires only when BOTH halves are in the file: a same-key replacement that
 * overrides the field (`{ ...t, done }` in a `.map` callback, `.with(i, {…})`,
 * `.splice(i, 1, {…})`, `xs[i] = {…}`) and a keyed row reading that field. A
 * read with no replacement in sight is fine (items never change identity), and
 * the field-name intersection keeps unrelated spreads quiet. A value the `by`
 * key reads never goes stale (a change to it changes the key, so the row is
 * rebuilt), and the match is by exact PATH: a key on `${t.id}:${t.done}`
 * covers `t.done`, a key on `t.node.id` covers `t.node.id` but not
 * `t.node.title`, and `${t.meta}` (an object) does not cover `t.meta.title`.
 * A key that changes on any replacement (`(t) => t`, `JSON.stringify(t)`)
 * skips the `<For>`. A key the rule cannot see into (an imported `keyOf`,
 * `(t) => keyOf(t)`, `keyBy('id')`) keeps reporting, and the message says the
 * read is safe only if that function reads the field. Calls (`t.done()`, a
 * per-item signal) are not stale reads.
 *
 * Mirror of the `for-stale-item-field` code in `detectPyreonPatterns`
 * (`@pyreon/compiler`, `stale-for-item.ts`), which feeds `pyreon check`, MCP
 * `validate` and the Reactivity Lens. Keep the two in step: the shared cases
 * live in both packages' tests.
 */

type Node = any

interface Replaced {
  fields: Set<string>
  any: boolean
}

/** What a `by` key reads off its item; see `KeyInfo` in the compiler's `stale-for-item.ts`. */
interface KeyInfo {
  paths: Set<string>
  always: boolean
  opaque: string | undefined
}

function unwrap(n: Node): Node {
  let e = n
  while (
    e &&
    (e.type === 'ParenthesizedExpression' ||
      e.type === 'TSAsExpression' ||
      e.type === 'TSSatisfiesExpression' ||
      e.type === 'TSNonNullExpression' ||
      e.type === 'TSTypeAssertion')
  ) {
    e = e.expression
  }

  return e
}

const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'])
const isFn = (n: Node): boolean => !!n && FUNCTION_TYPES.has(n.type)

/** Walk with the parent in hand. Return `false` from `visit` to skip children. */
function walk(node: Node, parent: Node, visit: (n: Node, parent: Node) => boolean | void): void {
  if (!node || typeof node.type !== 'string') return
  if (visit(node, parent) === false) return
  const keys = visitorKeys[node.type]
  if (!keys) return
  for (const key of keys) {
    const child = node[key]
    if (Array.isArray(child)) {
      for (const item of child) walk(item, node, visit)
    } else if (child && typeof child.type === 'string') {
      walk(child, node, visit)
    }
  }
}

function keyName(key: Node, computed: boolean): string | undefined {
  if (!key) return undefined
  if (!computed && key.type === 'Identifier') return key.name
  if (key.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number')) {
    return String(key.value)
  }

  return undefined
}

function recordLiteral(lit: Node, out: Replaced, itemName?: string): void {
  let spreadsItem = false
  let spreads = 0
  for (const p of lit.properties) {
    if (p.type === 'SpreadElement') {
      spreads++
      const e = unwrap(p.argument)
      if (itemName !== undefined && e?.type === 'Identifier' && e.name === itemName) spreadsItem = true
    }
  }
  if (itemName !== undefined ? !spreadsItem : spreads === 0) return
  if (itemName === undefined && spreads > 1) out.any = true
  for (const p of lit.properties) {
    if (p.type === 'SpreadElement') {
      const e = unwrap(p.argument)
      const isItem = itemName !== undefined && e?.type === 'Identifier' && e.name === itemName
      if (!isItem && itemName !== undefined) out.any = true
      continue
    }
    if (p.type === 'Property') {
      const n = keyName(p.key, p.computed)
      if (n === undefined) out.any = true
      else out.fields.add(n)
    }
  }
}

function collectReplaced(program: Node): Replaced {
  const out: Replaced = { fields: new Set(), any: false }
  walk(program, null, (n) => {
    if (n.type === 'CallExpression' && n.callee?.type === 'MemberExpression' && !n.callee.computed) {
      const method = n.callee.property?.name
      const args = n.arguments ?? []
      const a0 = args[0]
      if (method === 'map' && a0 && (a0.type === 'ArrowFunctionExpression' || a0.type === 'FunctionExpression')) {
        const p = a0.params?.[0]
        if (p?.type === 'Identifier') {
          const item = p.name
          walk(a0.body, a0, (x) => {
            if (x.type === 'ObjectExpression') recordLiteral(x, out, item)
            if (isFn(x)) return false
          })
        }
      } else if (method === 'with' && args[1]) {
        const lit = unwrap(args[1])
        if (lit?.type === 'ObjectExpression') recordLiteral(lit, out)
      } else if (method === 'splice') {
        for (const arg of args.slice(2)) {
          const lit = unwrap(arg)
          if (lit?.type === 'ObjectExpression') recordLiteral(lit, out)
        }
      }
    } else if (
      n.type === 'AssignmentExpression' &&
      n.operator === '=' &&
      n.left?.type === 'MemberExpression' &&
      n.left.computed
    ) {
      const lit = unwrap(n.right)
      if (lit?.type === 'ObjectExpression') recordLiteral(lit, out)
    }
  })

  return out
}

/** `path` is the full read (`node.title`); its first segment is the field a replacement overrides. */
const replacedHas = (r: Replaced, path: string, key: KeyInfo): boolean => {
  if (key.always || key.paths.has(path)) return false
  const field = path.split('.')[0] as string

  return r.any || r.fields.has(field)
}

function bindsName(pattern: Node, name: string): boolean {
  if (!pattern) return false
  switch (pattern.type) {
    case 'Identifier':
      return pattern.name === name
    case 'AssignmentPattern':
      return bindsName(pattern.left, name)
    case 'RestElement':
      return bindsName(pattern.argument, name)
    case 'ArrayPattern':
      return (pattern.elements ?? []).some((e: Node) => bindsName(e, name))
    case 'ObjectPattern':
      return (pattern.properties ?? []).some((p: Node) =>
        p.type === 'RestElement' ? bindsName(p.argument, name) : bindsName(p.value, name),
      )
    default:
      return false
  }
}

function paramIdentifier(p: Node): Node {
  if (p?.type === 'AssignmentPattern') return p.left
  return p
}

/** Every `<name>.<field>` read (not a call, not a method callee, not a write) in `root`. */
function fieldReads(root: Node, rootParent: Node, name: string): Node[] {
  const out: Node[] = []
  const parentOf = new Map<Node, Node>()
  let stop = false
  walk(root, rootParent, (n, parent) => {
    if (stop) return false
    parentOf.set(n, parent)
    if (n !== root && isFn(n) && (n.params ?? []).some((p: Node) => bindsName(p, name))) return false
    if (n.type === 'VariableDeclarator' && bindsName(n.id, name)) {
      // `const t = …` rebinds the name; rare enough that dropping the scope is
      // the quiet choice.
      out.length = 0
      stop = true
      return false
    }
    if (
      n.type === 'MemberExpression' &&
      !n.computed &&
      n.object?.type === 'Identifier' &&
      n.object.name === name &&
      n.property?.type === 'Identifier'
    ) {
      const isCallee = parent?.type === 'CallExpression' && parent.callee === n
      const isWrite = parent?.type === 'AssignmentExpression' && parent.left === n
      // `x.f.set(v)` / `x.f.get()`: a per-item signal's method, not a stale read.
      const grand = parentOf.get(parent)
      const isMethodCallee =
        parent?.type === 'MemberExpression' &&
        parent.object === n &&
        grand?.type === 'CallExpression' &&
        grand.callee === parent
      if (!isCallee && !isWrite && !isMethodCallee) out.push(n)
    }
  })

  return out
}

function patternKey(p: Node): string | undefined {
  if (p.type !== 'Property') return undefined
  return keyName(p.key, p.computed)
}

function collectComponents(program: Node): Map<string, Node> {
  const out = new Map<string, Node>()
  walk(program, null, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id?.name && /^[A-Z]/.test(n.id.name)) out.set(n.id.name, n)
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && /^[A-Z]/.test(n.id.name) && n.init) {
      const init = unwrap(n.init)
      if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') out.set(n.id.name, init)
    }
  })

  return out
}

function componentFields(comp: Node, attr: string | null, r: Replaced, key: KeyInfo, parents: Parents): string[] {
  const p = paramIdentifier(comp.params?.[0])
  if (!p || !comp.body) return []
  const found = new Set<string>()
  const check = (path: string[]): void => {
    if (path.length > 0 && replacedHas(r, path.join('.'), key)) found.add(path[0] as string)
  }
  if (p.type === 'Identifier') {
    for (const m of fieldReads(comp.body, comp, p.name)) {
      const path = memberChain(m.object, parents).path
      // `props.todo.done` for an attribute; `props.done` for a spread item.
      if (attr === null) check(path)
      else if (path[0] === attr) check(path.slice(1))
    }
  } else if (p.type === 'ObjectPattern') {
    for (const el of p.properties ?? []) {
      const k = patternKey(el)
      if (k === undefined) continue
      if (attr === null) {
        for (const path of bindingPaths(el.value, comp.body, parents)) check([k, ...path])
        continue
      }
      if (k !== attr) continue
      for (const path of bindingPaths(el.value, comp.body, parents)) check(path)
    }
  }

  return [...found]
}

/** The paths read through a binding: an identifier's member reads, or a nested pattern's leaves. */
function bindingPaths(binding: Node, body: Node, parents: Parents): string[][] {
  const b = paramIdentifier(binding)
  if (b?.type === 'Identifier') {
    const reads = fieldReads(body, null, b.name).map((m) => memberChain(m.object, parents).path)

    return reads.length > 0 ? reads : [[]]
  }
  if (b?.type !== 'ObjectPattern') return []
  const out: string[][] = []
  for (const el of b.properties ?? []) {
    const k = patternKey(el)
    if (k === undefined) continue
    const inner = paramIdentifier(el.value)
    for (const path of inner?.type === 'ObjectPattern' ? bindingPaths(inner, body, parents) : [[]]) out.push([k, ...path])
  }

  return out
}

function jsxAttr(opening: Node, name: string): Node | undefined {
  return (opening.attributes ?? []).find(
    (a: Node) => a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier' && a.name.name === name,
  )
}

const WRAPPERS = new Set(['ParenthesizedExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression'])

/** A type position (`typeof t`, an annotation): never a read of the item. */
const isTypeNode = (n: Node): boolean =>
  typeof n?.type === 'string' && n.type.startsWith('TS') && !WRAPPERS.has(n.type) && n.type !== 'TSTypeAssertion'

type Parents = Map<Node, Node>

const SCOPES = new Set(['Program', 'BlockStatement', 'StaticBlock', 'TSModuleBlock'])

/**
 * The function `name` refers to at `from`, by scope: the innermost block or
 * module that declares it. Undefined when the nearest binding is a parameter,
 * an import, or anything that is not a function. Mirror of `resolveInScope`.
 */
function resolveInScope(from: Node, name: string, parents: Parents): Node | undefined {
  for (let n = parents.get(from); n; n = parents.get(n)) {
    if (isFn(n) && (n.params ?? []).some((q: Node) => bindsName(q, name))) return undefined
    const body = SCOPES.has(n.type) ? n.body : n.type === 'SwitchCase' ? n.consequent : undefined
    if (!Array.isArray(body)) continue
    for (const raw of body) {
      const found = declares(raw, name)
      if (found !== null) return found
    }
  }

  return undefined
}

/**
 * What statement `raw` declares under `name`: the function, `undefined` for a
 * binding that is not one (an import, a non-function const), `null` for none.
 */
function declares(raw: Node, name: string): Node | undefined | null {
  const st = raw.type === 'ExportNamedDeclaration' || raw.type === 'ExportDefaultDeclaration' ? raw.declaration : raw
  if (!st) return null
  if (st.type === 'FunctionDeclaration' && st.id?.name === name) return st.body ? st : undefined
  if (st.type === 'ImportDeclaration' && (st.specifiers ?? []).some((sp: Node) => sp.local?.name === name)) return undefined
  if (st.type !== 'VariableDeclaration') return null
  const d = (st.declarations ?? []).find((x: Node) => bindsName(x.id, name))
  if (!d) return null
  const init = d.id?.type === 'Identifier' && d.init ? unwrap(d.init) : undefined

  return init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression' ? init : undefined
}

/** `n` (an Identifier) sits in expression position: not a property key, a declaration or a type. */
function isReference(n: Node, parent: Node): boolean {
  if (!parent) return true
  if (parent.type === 'MemberExpression' && parent.property === n && !parent.computed) return false
  if (parent.type === 'Property' && parent.key === n && !parent.computed && !parent.shorthand) return false
  if (parent.type === 'VariableDeclarator' && parent.id === n) return false
  if (isFn(parent) && (parent.id === n || (parent.params ?? []).includes(n))) return false

  // Type positions never get here: every walker skips type nodes first.
  return true
}

/** `x.name`, `x['name']`, `` x[`name`] `` → `name`; undefined for a dynamic key. */
function memberName(m: Node): string | undefined {
  const prop = m.property
  if (!m.computed) return prop?.type === 'Identifier' ? prop.name : undefined
  if (prop?.type === 'Literal' && typeof prop.value === 'string') return prop.value
  if (prop?.type === 'TemplateLiteral' && (prop.expressions ?? []).length === 0) return prop.quasis?.[0]?.value?.cooked

  return undefined
}

/**
 * The member path read off `use` (`t.node.id` → `node.id`, through `as`, `!`,
 * parentheses and `t['done']`), stopping before a method call. Mirror of
 * `memberChain` in the compiler.
 */
function memberChain(use: Node, parents: Parents): { path: string[]; top: Node } {
  const path: string[] = []
  let cur = use
  for (;;) {
    let parent = parents.get(cur)
    while (parent && WRAPPERS.has(parent.type)) {
      cur = parent
      parent = parents.get(parent)
    }
    if (parent?.type !== 'MemberExpression' || parent.object !== cur) break
    const name = memberName(parent)
    if (name === undefined) break
    const grand = parents.get(parent)
    if (grand?.type === 'CallExpression' && grand.callee === parent) break
    path.push(name)
    cur = parent
  }

  return { path, top: cur }
}

/**
 * What the `by` key reads off its item. Mirror of `keyInfoOf` in the
 * compiler's `stale-for-item.ts`; the shared case table runs both.
 */
function keyInfoOf(byAttr: Node | undefined, forEl: Node, parents: Parents, source: string): KeyInfo {
  const out: KeyInfo = { paths: new Set(), always: false, opaque: undefined }
  const text = (n: Node): string => {
    const t = source.slice(n.start, n.end).replace(/\s+/g, ' ')

    return t.length > 40 ? `${t.slice(0, 37)}...` : t
  }
  let fn = byAttr?.value?.type === 'JSXExpressionContainer' ? unwrap(byAttr.value.expression) : undefined
  // `by={}` is a parse error, so a missing expression is a bare `by` attribute.
  if (!fn) return out
  if (fn.type === 'Identifier') {
    const name = fn.name
    fn = resolveInScope(forEl, name, parents)
    if (!fn) {
      out.opaque = name
      return out
    }
  }
  if (!isFn(fn)) {
    if (fn.type !== 'Literal' && fn.type !== 'TemplateLiteral') out.opaque = text(fn)
    return out
  }
  const p = paramIdentifier(fn.params?.[0])
  if (!p || !fn.body) return out
  // `parents` covers the whole program, the key function's body included.
  if (p.type === 'Identifier') readsOfItem(p.name, fn.body, out, parents, text)
  else if (p.type === 'ObjectPattern') patternPaths(p, [], fn.body, out, parents)
  else out.opaque = 'the key'

  return out
}

function isUsed(body: Node, name: string): boolean {
  let used = false
  walk(body, null, (n, parent) => {
    if (used || isTypeNode(n)) return false
    if (n.type === 'Identifier' && n.name === name && isReference(n, parent)) used = true
  })

  return used
}

function patternPaths(pattern: Node, prefix: string[], body: Node, out: KeyInfo, parents: Parents): void {
  for (const el of pattern.properties ?? []) {
    if (el.type === 'RestElement') {
      if (el.argument?.type === 'Identifier' && isUsed(body, el.argument.name)) out.opaque ??= 'the key'
      continue
    }
    const k = patternKey(el)
    if (k === undefined) {
      out.opaque ??= 'the key'
      continue
    }
    const path = [...prefix, k]
    const value = paramIdentifier(el.value)
    if (value?.type === 'ObjectPattern') patternPaths(value, path, body, out, parents)
    else if (value?.type === 'Identifier') addValuePaths(value.name, path, body, out, parents)
    else out.opaque ??= 'the key'
  }
}

function addValuePaths(name: string, path: string[], body: Node, out: KeyInfo, parents: Parents): void {
  let bare = false
  walk(body, null, (n, parent) => {
    if (isTypeNode(n)) return false
    if (isFn(n) && (n.params ?? []).some((q: Node) => bindsName(q, name))) return false
    if (n.type === 'Identifier' && n.name === name && isReference(n, parent)) {
      const chain = memberChain(n, parents)
      if (chain.path.length === 0) bare = true
      else out.paths.add([...path, ...chain.path].join('.'))
    }
  })
  if (bare) out.paths.add(path.join('.'))
}

function readsOfItem(item: string, body: Node, out: KeyInfo, parents: Parents, text: (n: Node) => string): void {
  const ret = body.type === 'BlockStatement' ? body.body?.find((s: Node) => s.type === 'ReturnStatement')?.argument : body
  const returned = unwrap(ret)
  if (returned?.type === 'Identifier' && returned.name === item) {
    out.always = true
    return
  }
  walk(body, null, (n, parent) => {
    if (isTypeNode(n)) return false
    if (isFn(n) && (n.params ?? []).some((q: Node) => bindsName(q, item))) return false
    if (n.type !== 'Identifier' || n.name !== item || !isReference(n, parent)) return
    const chain = memberChain(n, parents)
    if (chain.path.length > 0) {
      out.paths.add(chain.path.join('.'))
      return
    }
    const up = parents.get(chain.top)
    if (up?.type === 'VariableDeclarator' && up.init === chain.top && up.id?.type === 'ObjectPattern') {
      patternPaths(up.id, [], body, out, parents)
      return
    }
    const callee = up?.type === 'CallExpression' && (up.arguments ?? []).includes(chain.top) ? up.callee : undefined
    if (
      callee?.type === 'MemberExpression' &&
      up.arguments[0] === chain.top &&
      callee.object?.type === 'Identifier' &&
      callee.object.name === 'JSON' &&
      callee.property?.name === 'stringify'
    ) {
      out.always = true
      return
    }
    out.opaque ??= callee ? text(callee) : 'the key'
  })
}

/**
 * A `<For>` whose `each` is the RESULT of a call (`list.data() ?? []`,
 * `todos()`) written inside a `{() => …}` accessor is rebuilt, rows and all,
 * whenever the accessor re-runs, and the eager read makes it re-run on every
 * list change, so its rows are always fresh. A row callback of an outer
 * `<For>` / `<Index>` is not an accessor (it runs once per key).
 */
function remountsOnListChange(forEl: Node, eachAttr: Node, parentOf: Map<Node, Node>): boolean {
  let e = eachAttr?.value?.type === 'JSXExpressionContainer' ? unwrap(eachAttr.value.expression) : undefined
  if (e?.type === 'LogicalExpression' && (e.operator === '??' || e.operator === '||')) e = unwrap(e.left)
  if (e?.type !== 'CallExpression') return false
  let n = parentOf.get(forEl)
  while (n) {
    if (isFn(n)) {
      const holder = parentOf.get(n)
      if (holder?.type !== 'JSXExpressionContainer') return false
      const owner = parentOf.get(holder)
      const tag = owner?.type === 'JSXElement' ? owner.openingElement?.name?.name : undefined

      return !(tag === 'For' || tag === 'Index')
    }
    n = parentOf.get(n)
  }

  return false
}

export const noStaleForItemField: Rule = {
  meta: {
    id: 'pyreon/no-stale-for-item-field',
    category: 'reactivity',
    description:
      'A keyed `<For>` row reads a field of its item while this file replaces items under the same key — on the web the row keeps the first value (iOS/Android redraw). Read the live value by key through a call, or give the field its own signal.',
    severity: 'error',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}
    const source = context.getSourceText()
    // Cheap pre-filter: no keyed <For> or no spread means no finding.
    if (!source.includes('<For') || !source.includes('...')) return {}
    let program: Node
    const callbacks: VisitorCallbacks = {
      Program(node: Node) {
        program = node
      },
      'Program:exit'() {
        if (!program) return
        const replaced = collectReplaced(program)
        if (!replaced.any && replaced.fields.size === 0) return
        let components: Map<string, Node> | undefined

        const report = (node: Node, message: string): void => {
          context.report({ message, span: getSpan(node) })
        }
        const tail = (fields: string[], opaque: string | undefined): string =>
          ` — but this file replaces items under the same \`by\` key (\`{ ...item, ${fields.join(', ')}: … }\`). On the web a keyed <For> keeps that row and runs its callback once per key, so the item is the object the row mounted with and this read keeps the FIRST value (iOS and Android redraw the row). Read the live value by key through a call (\`isDone(t.id)\`), which stays reactive on web and lowers to a lookup on native, or give the field its own signal.${opaque !== undefined ? ` (Safe only if \`${opaque}\` reads \`${fields.join('`, `')}\` into the key, which this rule cannot see: inline the key so it can, or disable this line if it does.)` : ''}`

        const parents: Parents = new Map()
        walk(program, null, (n, parent) => {
          parents.set(n, parent)
        })

        const checkRow = (fn: Node, key: KeyInfo): void => {
          const p = paramIdentifier(fn.params?.[0])
          if (!p) return
          if (p.type === 'ObjectPattern') {
            for (const el of p.properties ?? []) {
              const k = patternKey(el)
              if (k === undefined) continue
              const inner = paramIdentifier(el.value)
              const leaves = inner?.type === 'ObjectPattern' ? bindingPaths(inner, fn.body, parents) : [[]]
              if (leaves.some((path) => replacedHas(replaced, [k, ...path].join('.'), key))) {
                report(el, `<For> row destructures \`${k}\` from its item${tail([k], key.opaque)}`)
              }
            }

            return
          }
          if (p.type !== 'Identifier') return
          const item = p.name
          for (const m of fieldReads(fn.body, fn, item)) {
            if (replacedHas(replaced, memberChain(m.object, parents).path.join('.'), key)) {
              report(m, `<For> row reads \`${item}.${m.property.name}\`${tail([m.property.name], key.opaque)}`)
            }
          }
          walk(fn.body, fn, (n) => {
            if (n !== fn.body && isFn(n) && (n.params ?? []).some((q: Node) => bindsName(q, item))) return false
            if (n.type !== 'JSXOpeningElement' || n.name?.type !== 'JSXIdentifier') return
            const tag = n.name.name as string
            if (!/^[A-Z]/.test(tag) || tag === 'For') return
            components ??= collectComponents(program)
            const comp = components.get(tag)
            if (!comp) return
            for (const a of n.attributes ?? []) {
              let attrName: string | null | undefined
              if (a.type === 'JSXAttribute' && a.value?.type === 'JSXExpressionContainer') {
                const e = unwrap(a.value.expression)
                if (e?.type === 'Identifier' && e.name === item && a.name?.type === 'JSXIdentifier') {
                  attrName = a.name.name
                }
              } else if (a.type === 'JSXSpreadAttribute') {
                const e = unwrap(a.argument)
                if (e?.type === 'Identifier' && e.name === item) attrName = null
              }
              if (attrName === undefined) continue
              const fields = componentFields(comp, attrName, replaced, key, parents)
              if (fields.length > 0) {
                report(
                  a,
                  `<For> row passes its item to \`<${tag}>\`, which reads \`${fields.join('`, `')}\` off it${tail(fields, key.opaque)}`,
                )
              }
            }
          })
        }

        walk(program, null, (n) => {
          if (n.type !== 'JSXElement') return
          const opening = n.openingElement
          if (opening?.name?.type !== 'JSXIdentifier' || opening.name.name !== 'For') return
          const eachAttr = jsxAttr(opening, 'each')
          if (!eachAttr) return
          const byAttr = jsxAttr(opening, 'by')
          if (!byAttr) return
          if (remountsOnListChange(n, eachAttr, parents)) return
          const key = keyInfoOf(byAttr, n, parents, source)
          if (key.always) return
          for (const child of n.children ?? []) {
            if (child.type !== 'JSXExpressionContainer') continue
            const fn = unwrap(child.expression)
            if (fn?.type === 'ArrowFunctionExpression' || fn?.type === 'FunctionExpression') checkRow(fn, key)
          }
        })
      },
    }

    return callbacks
  },
}
