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
 * the field-name intersection keeps unrelated spreads quiet. A field the `by`
 * key reads never goes stale (a change to it changes the key, so the row is
 * rebuilt): every read counts, in a composite template (`${t.id}:${t.done}`),
 * an array `join`, a member chain (`t.meta.rev` → `meta`), `t['done']`, a
 * destructured key param, or a same-file key function. A key that hands the
 * whole item to something the rule cannot see into (`keyOf(t)`, an imported
 * `by={keyOf}`) may read any field, so that `<For>` is skipped. Calls
 * (`t.done()`, a per-item signal) are not stale reads.
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

/** The item fields a `by` key reads; `all` when it may read any of them. */
interface KeyFields {
  fields: Set<string>
  all: boolean
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

const replacedHas = (r: Replaced, field: string, key: KeyFields): boolean =>
  !key.all && !key.fields.has(field) && (r.any || r.fields.has(field))

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

function componentFields(comp: Node, attr: string | null, r: Replaced, keyFields: KeyFields): string[] {
  const p = paramIdentifier(comp.params?.[0])
  if (!p || !comp.body) return []
  const found = new Set<string>()
  if (p.type === 'Identifier') {
    // Collect `props.attr.field` by walking with parents.
    const reads = fieldReads(comp.body, comp, p.name)
    const readSet = new Set(reads)
    if (attr === null) {
      for (const m of reads) if (replacedHas(r, m.property.name, keyFields)) found.add(m.property.name)
    } else {
      walk(comp.body, comp, (n, parent) => {
        if (
          n.type === 'MemberExpression' &&
          !n.computed &&
          readSet.has(n.object) &&
          n.object.property.name === attr &&
          n.property?.type === 'Identifier'
        ) {
          const isCallee = parent?.type === 'CallExpression' && parent.callee === n
          if (!isCallee && replacedHas(r, n.property.name, keyFields)) found.add(n.property.name)
        }
      })
    }
  } else if (p.type === 'ObjectPattern') {
    for (const el of p.properties ?? []) {
      const key = patternKey(el)
      if (key === undefined) continue
      if (attr === null) {
        if (replacedHas(r, key, keyFields)) found.add(key)
        continue
      }
      if (key !== attr) continue
      const value = paramIdentifier(el.value)
      if (value?.type === 'Identifier') {
        for (const m of fieldReads(comp.body, comp, value.name)) {
          if (replacedHas(r, m.property.name, keyFields)) found.add(m.property.name)
        }
      } else if (value?.type === 'ObjectPattern') {
        for (const inner of value.properties ?? []) {
          const k = patternKey(inner)
          if (k !== undefined && replacedHas(r, k, keyFields)) found.add(k)
        }
      }
    }
  }

  return [...found]
}

function jsxAttr(opening: Node, name: string): Node | undefined {
  return (opening.attributes ?? []).find(
    (a: Node) => a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier' && a.name.name === name,
  )
}

const WRAPPERS = new Set(['ParenthesizedExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression'])

/** A same-file `const keyOf = (t) => …` / `function keyOf(t) { … }` by name. */
function resolveLocalFunction(program: Node, name: string): Node | undefined {
  let found: Node | undefined
  walk(program, null, (n) => {
    if (found) return false
    if (n.type === 'FunctionDeclaration' && n.id?.name === name && n.body) found = n
    else if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && n.id.name === name && n.init) {
      const init = unwrap(n.init)
      if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') found = init
    }
  })

  return found
}

/** `n` (an Identifier) sits in expression position: not a property key, a declaration or a type. */
function isReference(n: Node, parent: Node): boolean {
  if (!parent) return true
  if (parent.type === 'MemberExpression' && parent.property === n && !parent.computed) return false
  if (parent.type === 'Property' && parent.key === n && !parent.computed && !parent.shorthand) return false
  if (parent.type === 'VariableDeclarator' && parent.id === n) return false
  if (isFn(parent) && (parent.id === n || (parent.params ?? []).includes(n))) return false
  if (typeof parent.type === 'string' && parent.type.startsWith('TS') && !WRAPPERS.has(parent.type)) return false

  return true
}

/**
 * Every item field the `by` key reads, wherever it sits in the key expression:
 * `t.id`, `${t.id}:${t.done}`, `[t.a, t.b].join(':')`, `t.meta.rev` (the field
 * is `meta`), `t['done']`, `String(t.id)`. A destructured key param reads its
 * keys. A use of the whole item other than a field read (`keyOf(t)`,
 * `JSON.stringify(t)`, `t[k]`, `by={(t) => t}`) can see every field, and so can
 * a key function that is not inline or in the same file: both give `all`.
 * Mirror of `keyFieldsOf` in `@pyreon/compiler`'s `stale-for-item.ts`.
 */
function keyFieldsOf(byAttr: Node | undefined, program: Node): KeyFields {
  const out: KeyFields = { fields: new Set(), all: false }
  let fn = byAttr?.value?.type === 'JSXExpressionContainer' ? unwrap(byAttr.value.expression) : undefined
  if (!fn || fn.type === 'JSXEmptyExpression') return out
  if (fn.type === 'Identifier') {
    fn = resolveLocalFunction(program, fn.name)
    if (!fn) {
      out.all = true
      return out
    }
  }
  if (!isFn(fn)) {
    // A call (`by={keyBy('id')}`) or member (`by={keys.row}`) builds a key
    // function the walk cannot see into. A literal is not a key function at
    // all (`<For>` throws on it), so it gives no key fields.
    if (fn.type !== 'Literal' && fn.type !== 'TemplateLiteral') out.all = true
    return out
  }
  const p = paramIdentifier(fn.params?.[0])
  if (!p || !fn.body) return out
  if (p.type === 'ObjectPattern') {
    for (const el of p.properties ?? []) {
      const key = patternKey(el)
      if (key === undefined) out.all = true
      else out.fields.add(key)
    }

    return out
  }
  if (p.type !== 'Identifier') {
    out.all = true
    return out
  }
  const item = p.name
  const parentOf = new Map<Node, Node>()
  walk(fn.body, fn, (n, parent) => {
    parentOf.set(n, parent)
    if (isFn(n) && (n.params ?? []).some((q: Node) => bindsName(q, item))) return false
    if (n.type !== 'Identifier' || n.name !== item || !isReference(n, parent)) return
    // Read through `(t as Row).done` / `t!.done`.
    let child = n
    let outer = parent
    while (outer && WRAPPERS.has(outer.type)) {
      child = outer
      outer = parentOf.get(outer)
    }
    if (outer?.type === 'MemberExpression' && outer.object === child) {
      if (!outer.computed && outer.property?.type === 'Identifier') {
        out.fields.add(outer.property.name)
        return
      }
      const k = outer.computed ? outer.property : undefined
      if (k?.type === 'Literal' && typeof k.value === 'string') {
        out.fields.add(k.value)
        return
      }
      if (k?.type === 'TemplateLiteral' && (k.expressions ?? []).length === 0) {
        out.fields.add(k.quasis?.[0]?.value?.cooked ?? '')
        return
      }
    }
    out.all = true
  })

  return out
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
        const tail = (fields: string[]): string =>
          ` — but this file replaces items under the same \`by\` key (\`{ ...item, ${fields.join(', ')}: … }\`). On the web a keyed <For> keeps that row and runs its callback once per key, so the item is the object the row mounted with and this read keeps the FIRST value (iOS and Android redraw the row). Read the live value by key through a call (\`isDone(t.id)\`), which stays reactive on web and lowers to a lookup on native, or give the field its own signal.`

        const checkRow = (fn: Node, keyFields: KeyFields): void => {
          const p = paramIdentifier(fn.params?.[0])
          if (!p) return
          if (p.type === 'ObjectPattern') {
            for (const el of p.properties ?? []) {
              const key = patternKey(el)
              if (key !== undefined && replacedHas(replaced, key, keyFields)) {
                report(el, `<For> row destructures \`${key}\` from its item${tail([key])}`)
              }
            }

            return
          }
          if (p.type !== 'Identifier') return
          const item = p.name
          for (const m of fieldReads(fn.body, fn, item)) {
            if (replacedHas(replaced, m.property.name, keyFields)) {
              report(m, `<For> row reads \`${item}.${m.property.name}\`${tail([m.property.name])}`)
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
              const fields = componentFields(comp, attrName, replaced, keyFields)
              if (fields.length > 0) {
                report(
                  a,
                  `<For> row passes its item to \`<${tag}>\`, which reads \`${fields.join('`, `')}\` off it${tail(fields)}`,
                )
              }
            }
          })
        }

        const parentOf = new Map<Node, Node>()
        walk(program, null, (n, parent) => {
          parentOf.set(n, parent)
          if (n.type !== 'JSXElement') return
          const opening = n.openingElement
          if (opening?.name?.type !== 'JSXIdentifier' || opening.name.name !== 'For') return
          const eachAttr = jsxAttr(opening, 'each')
          if (!eachAttr) return
          const byAttr = jsxAttr(opening, 'by')
          if (!byAttr) return
          if (remountsOnListChange(n, eachAttr, parentOf)) return
          const keyFields = keyFieldsOf(byAttr, program)
          if (keyFields.all) return
          for (const child of n.children ?? []) {
            if (child.type !== 'JSXExpressionContainer') continue
            const fn = unwrap(child.expression)
            if (fn?.type === 'ArrowFunctionExpression' || fn?.type === 'FunctionExpression') checkRow(fn, keyFields)
          }
        })
      },
    }

    return callbacks
  },
}
