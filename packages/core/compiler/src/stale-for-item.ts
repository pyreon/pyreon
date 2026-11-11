/**
 * `for-stale-item-field` — a keyed `<For>` row that reads a field of its item
 * when the same file replaces items under the same key.
 *
 * On the web a keyed `<For each={items} by={(t) => t.id}>` runs a row's
 * callback ONCE per key. An update that replaces an item object but keeps its
 * key (`items.set(items().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))`)
 * keeps the row, so a plain read of `t.done` in it shows the value the row
 * mounted with, forever. iOS and Android (PMTC output) redraw the row, so the
 * same source is right on two targets and stale on the third.
 *
 * Reading `t.done` is only wrong when items are REPLACED under their key, so
 * the detector needs both halves in the file before it says anything:
 *
 *  1. evidence of a same-key replacement, and the fields it changes: an object
 *     literal that spreads the old item and overrides fields (`{ ...t, done }`)
 *     inside a `.map((t) => …)` callback, a `.with(i, { …, done })`, a
 *     `.splice(i, 1, { …, done })` or an `xs[i] = { …, done }` write. Only the
 *     overridden fields can go stale; a spread of anything else (`{ ...t,
 *     ...patch }`) means "any field".
 *  2. a keyed `<For>` (with `by`) whose row callback reads one of those fields
 *     off its item param: `t.done` (not a call such as `t.done()`, which is a
 *     per-item signal), a destructured row param (`({ done }) => …`), or the
 *     whole item passed to a component defined in the same file that reads the
 *     field (`<Row todo={t} />` + `props.todo.done`).
 *
 * The `by` key field itself never goes stale (the row exists because of it).
 * A `<For>` rebuilt by an accessor on every list change (`{() => … <For
 * each={list.data() ?? []}> …}`) has fresh rows, so it is skipped.
 * File-level pairing on purpose: the `each` list is often a derived view of the
 * written list (`visible` over `todos`, a store accessor), which a syntax walk
 * cannot connect; the field-name intersection is what keeps it quiet.
 */
import ts from 'typescript'

/** Fields a same-key replacement can change. `any` when a non-item spread hides them. */
export interface ReplacedFields {
  fields: Set<string>
  any: boolean
}

export type StaleForItemKind = 'read' | 'destructure' | 'child-prop'

export interface StaleForItemHit {
  /** Where to report. */
  node: ts.Node
  kind: StaleForItemKind
  /** The row's item param name (or `{…}` for a destructured param). */
  param: string
  /** The stale field(s). */
  fields: string[]
  /** The `by` key field, when `by` is the simple `(x) => x.key` shape. */
  keyField: string | undefined
  /** For `child-prop`: the component and the attribute that received the item. */
  component?: string
  attr?: string
}

function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isTypeAssertionExpression(e)
  ) {
    e = e.expression
  }
  return e
}

function isFunctionLike(
  n: ts.Node,
): n is ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration | ts.MethodDeclaration {
  return (
    ts.isArrowFunction(n) ||
    ts.isFunctionExpression(n) ||
    ts.isFunctionDeclaration(n) ||
    ts.isMethodDeclaration(n)
  )
}

function propName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

/** Record the overridden fields of an object literal that spreads something. */
function recordLiteral(lit: ts.ObjectLiteralExpression, out: ReplacedFields, itemName?: string): boolean {
  let spreadsItem = false
  let spreads = 0
  for (const p of lit.properties) {
    if (ts.isSpreadAssignment(p)) {
      spreads++
      const e = unwrap(p.expression)
      if (itemName !== undefined && ts.isIdentifier(e) && e.text === itemName) spreadsItem = true
    }
  }
  if (itemName !== undefined ? !spreadsItem : spreads === 0) return false
  // `{ ...xs[i], ...patch }`: the first spread is the old item, the second
  // hides which fields move.
  if (itemName === undefined && spreads > 1) out.any = true
  for (const p of lit.properties) {
    if (ts.isSpreadAssignment(p)) {
      const e = unwrap(p.expression)
      const isItem = itemName !== undefined && ts.isIdentifier(e) && e.text === itemName
      // `{ ...xs[i], done }` in a `.with` / `splice` / index write: the spread
      // IS the old item. A second spread (`...patch`) hides which fields move.
      if (!isItem && itemName !== undefined) out.any = true
      continue
    }
    if (ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p)) {
      const n = propName(p.name)
      if (n === undefined) out.any = true
      else out.fields.add(n)
    } else if (ts.isShorthandPropertyAssignment(p)) {
      out.fields.add(p.name.text)
    }
  }
  return true
}

/** Visit `root`'s subtree without entering nested functions. */
function walkSameFunction(root: ts.Node, fn: (n: ts.Node) => void): void {
  const visit = (n: ts.Node): void => {
    fn(n)
    if (isFunctionLike(n)) return
    ts.forEachChild(n, visit)
  }
  ts.forEachChild(root, visit)
}

/** Half 1: the fields a same-key replacement in this file changes. */
export function collectReplacedFields(sf: ts.SourceFile): ReplacedFields {
  const out: ReplacedFields = { fields: new Set(), any: false }
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.text
      const [a0, a1, a2] = n.arguments
      if (method === 'map' && a0 && (ts.isArrowFunction(a0) || ts.isFunctionExpression(a0))) {
        const p = a0.parameters[0]
        if (p && ts.isIdentifier(p.name)) {
          const item = p.name.text
          const body = a0.body
          const check = (x: ts.Node): void => {
            if (ts.isObjectLiteralExpression(x)) recordLiteral(x, out, item)
          }
          if (ts.isBlock(body)) walkSameFunction(body, check)
          else {
            check(body)
            walkSameFunction(body, check)
          }
        }
      } else if (method === 'with' && a1) {
        const lit = unwrap(a1)
        if (ts.isObjectLiteralExpression(lit)) recordLiteral(lit, out)
      } else if (method === 'splice' && a2) {
        for (const arg of n.arguments.slice(2)) {
          const lit = unwrap(arg)
          if (ts.isObjectLiteralExpression(lit)) recordLiteral(lit, out)
        }
      }
    } else if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isElementAccessExpression(n.left)
    ) {
      const lit = unwrap(n.right)
      if (ts.isObjectLiteralExpression(lit)) recordLiteral(lit, out)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

function isReplaced(r: ReplacedFields, field: string, keyField: string | undefined): boolean {
  if (field === keyField) return false
  return r.any || r.fields.has(field)
}

function attrExpr(opening: ts.JsxOpeningLikeElement, name: string): ts.Expression | undefined {
  for (const a of opening.attributes.properties) {
    if (ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === name) {
      const init = a.initializer
      if (init && ts.isJsxExpression(init) && init.expression) return init.expression
      return undefined
    }
  }
  return undefined
}

function hasAttr(opening: ts.JsxOpeningLikeElement, name: string): boolean {
  return opening.attributes.properties.some(
    (a) => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === name,
  )
}

/** `by={(x) => x.id}` → `id`. */
function keyFieldOf(by: ts.Expression | undefined): string | undefined {
  if (!by) return undefined
  const fn = unwrap(by)
  if (!(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return undefined
  const p = fn.parameters[0]
  if (!p || !ts.isIdentifier(p.name)) return undefined
  let body: ts.Node | undefined = fn.body
  if (ts.isBlock(fn.body)) {
    const ret = fn.body.statements.find(ts.isReturnStatement)
    body = ret?.expression
  }
  if (!body || !ts.isExpression(body as ts.Expression)) return undefined
  const e = unwrap(body as ts.Expression)
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === p.name.text) {
    return e.name.text
  }
  return undefined
}

function bindsName(name: ts.BindingName, target: string): boolean {
  if (ts.isIdentifier(name)) return name.text === target
  for (const el of name.elements) {
    if (ts.isOmittedExpression(el)) continue
    if (bindsName(el.name, target)) return true
  }
  return false
}

/**
 * Every `<ident>.<field>` read in `root` where `<ident>` resolves to the
 * binding `name` (a nested function or block that rebinds the name is skipped).
 * Calls (`x.f()`) and signal methods (`x.f.set(v)`) are not reads of a stale
 * value; neither is an assignment target.
 */
function findFieldReads(root: ts.Node, name: string): ts.PropertyAccessExpression[] {
  const out: ts.PropertyAccessExpression[] = []
  let stop = false
  const visit = (n: ts.Node): void => {
    if (stop) return
    if (isFunctionLike(n) && n.parameters.some((p) => bindsName(p.name, name))) return
    if (ts.isVariableDeclaration(n) && bindsName(n.name, name)) {
      // `const t = …` inside the scope rebinds the name; rare enough that
      // dropping the whole scope is the quiet choice.
      out.length = 0
      stop = true
      return
    }
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) {
      const parent = n.parent
      const isCallee = ts.isCallExpression(parent) && parent.expression === n
      const isMethodCallee =
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === n &&
        ts.isCallExpression(parent.parent) &&
        parent.parent.expression === parent
      const isWrite =
        ts.isBinaryExpression(parent) &&
        parent.left === n &&
        parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      if (!isCallee && !isMethodCallee && !isWrite) out.push(n)
    }
    ts.forEachChild(n, visit)
  }
  visit(root)
  return out
}

type ComponentFn = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration

function collectComponents(sf: ts.SourceFile): Map<string, ComponentFn> {
  const out = new Map<string, ComponentFn>()
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionDeclaration(n) && n.name && /^[A-Z]/.test(n.name.text)) out.set(n.name.text, n)
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /^[A-Z]/.test(n.name.text) && n.initializer) {
      const init = unwrap(n.initializer)
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) out.set(n.name.text, init)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/**
 * Fields of `attr` the component reads. `attr === null` means the item was
 * SPREAD onto the component (`<Row {...t} />`), so `props.<field>` reads count.
 */
function componentFieldReads(
  comp: ComponentFn,
  attr: string | null,
  r: ReplacedFields,
  keyField: string | undefined,
): string[] {
  const p = comp.parameters[0]
  if (!p || !comp.body) return []
  const found = new Set<string>()
  if (ts.isIdentifier(p.name)) {
    const propsName = p.name.text
    for (const read of findFieldReads(comp.body, propsName)) {
      if (attr === null) {
        if (isReplaced(r, read.name.text, keyField)) found.add(read.name.text)
        continue
      }
      if (read.name.text !== attr) continue
      // `props.todo.done`
      const outer = read.parent
      if (ts.isPropertyAccessExpression(outer) && outer.expression === read) {
        const isCallee = ts.isCallExpression(outer.parent) && outer.parent.expression === outer
        if (!isCallee && isReplaced(r, outer.name.text, keyField)) found.add(outer.name.text)
      }
    }
  } else if (ts.isObjectBindingPattern(p.name)) {
    for (const el of p.name.elements) {
      const key = el.propertyName ? propName(el.propertyName) : ts.isIdentifier(el.name) ? el.name.text : undefined
      if (key === undefined) continue
      if (attr === null) {
        if (isReplaced(r, key, keyField)) found.add(key)
        continue
      }
      if (key !== attr) continue
      if (ts.isIdentifier(el.name)) {
        for (const read of findFieldReads(comp.body, el.name.text)) {
          if (isReplaced(r, read.name.text, keyField)) found.add(read.name.text)
        }
      } else if (ts.isObjectBindingPattern(el.name)) {
        for (const inner of el.name.elements) {
          const k = inner.propertyName
            ? propName(inner.propertyName)
            : ts.isIdentifier(inner.name)
              ? inner.name.text
              : undefined
          if (k !== undefined && isReplaced(r, k, keyField)) found.add(k)
        }
      }
    }
  }
  return [...found]
}

/**
 * A `<For>` whose `each` is the RESULT of a call (`list.data() ?? []`,
 * `todos()`) written inside a `{() => …}` accessor is rebuilt, rows and all,
 * every time that accessor re-runs, and the eager read makes it re-run on every
 * list change. Its rows are always fresh, so no read in them can go stale.
 * (`each={todos}` passes the signal itself; the accessor does not track it and
 * the rows are kept as usual.) A row callback of an outer `<For>` is not an
 * accessor: it runs once per key.
 */
function remountsOnListChange(forEl: ts.JsxElement, each: ts.Expression | undefined): boolean {
  if (!each) return false
  let e = unwrap(each)
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) e = unwrap(e.left)
  }
  if (!ts.isCallExpression(e)) return false
  let n: ts.Node = forEl.parent
  while (n && !ts.isSourceFile(n)) {
    if (isFunctionLike(n)) {
      const holder = n.parent
      if (!holder || !ts.isJsxExpression(holder)) return false
      const owner = holder.parent
      if (ts.isJsxElement(owner) && ts.isIdentifier(owner.openingElement.tagName)) {
        const tag = owner.openingElement.tagName.text
        if (tag === 'For' || tag === 'Index') return false
      }
      return true
    }
    n = n.parent
  }
  return false
}

/** Half 2, gated on half 1: every stale read in a keyed `<For>` row. */
export function findStaleForItemReads(sf: ts.SourceFile): StaleForItemHit[] {
  const replaced = collectReplacedFields(sf)
  if (!replaced.any && replaced.fields.size === 0) return []
  let components: Map<string, ComponentFn> | undefined
  const hits: StaleForItemHit[] = []

  const visit = (n: ts.Node): void => {
    if (
      ts.isJsxElement(n) &&
      ts.isIdentifier(n.openingElement.tagName) &&
      n.openingElement.tagName.text === 'For' &&
      hasAttr(n.openingElement, 'each') &&
      hasAttr(n.openingElement, 'by') &&
      !remountsOnListChange(n, attrExpr(n.openingElement, 'each'))
    ) {
      const keyField = keyFieldOf(attrExpr(n.openingElement, 'by'))
      for (const child of n.children) {
        if (!ts.isJsxExpression(child) || !child.expression) continue
        const fn = unwrap(child.expression)
        if (!(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) continue
        checkRow(fn, keyField)
      }
    }
    ts.forEachChild(n, visit)
  }

  const checkRow = (fn: ts.ArrowFunction | ts.FunctionExpression, keyField: string | undefined): void => {
    const p = fn.parameters[0]
    if (!p) return
    if (ts.isObjectBindingPattern(p.name)) {
      for (const el of p.name.elements) {
        const key = el.propertyName ? propName(el.propertyName) : ts.isIdentifier(el.name) ? el.name.text : undefined
        if (key !== undefined && isReplaced(replaced, key, keyField)) {
          hits.push({ node: el, kind: 'destructure', param: '{…}', fields: [key], keyField })
        }
      }
      return
    }
    if (!ts.isIdentifier(p.name)) return
    const item = p.name.text
    for (const read of findFieldReads(fn.body, item)) {
      if (isReplaced(replaced, read.name.text, keyField)) {
        hits.push({ node: read, kind: 'read', param: item, fields: [read.name.text], keyField })
      }
    }
    // The whole item handed to a same-file component that reads the field.
    const visitJsx = (n: ts.Node): void => {
      if (n !== fn.body && isFunctionLike(n) && n.parameters.some((q) => bindsName(q.name, item))) return
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName)) {
        const tag = n.tagName.text
        if (/^[A-Z]/.test(tag) && tag !== 'For') {
          components ??= collectComponents(sf)
          const comp = components.get(tag)
          if (comp) {
            for (const a of n.attributes.properties) {
              let attrName: string | null | undefined
              if (ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.initializer && ts.isJsxExpression(a.initializer)) {
                const e = a.initializer.expression && unwrap(a.initializer.expression)
                if (e && ts.isIdentifier(e) && e.text === item) attrName = a.name.text
              } else if (ts.isJsxSpreadAttribute(a)) {
                const e = unwrap(a.expression)
                if (ts.isIdentifier(e) && e.text === item) attrName = null
              }
              if (attrName === undefined) continue
              const fields = componentFieldReads(comp, attrName, replaced, keyField)
              if (fields.length > 0) {
                hits.push({
                  node: a,
                  kind: 'child-prop',
                  param: item,
                  fields,
                  keyField,
                  component: tag,
                  ...(attrName !== null ? { attr: attrName } : {}),
                })
              }
            }
          }
        }
      }
      ts.forEachChild(n, visitJsx)
    }
    visitJsx(fn.body)
  }

  visit(sf)
  return hits
}
