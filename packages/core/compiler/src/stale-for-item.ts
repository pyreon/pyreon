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
 * A value the `by` key reads never goes stale: when it changes the key changes,
 * so the row is rebuilt with the new item. `keyInfoOf` records the exact PATH
 * of every read (`t.id` → `id`, `${t.id}:${t.done}`, `[t.a, t.b].join()`,
 * `t.node.id` → `node.id`, `t['done']`, a destructured `({ node: { id } })`,
 * `const { id } = t`, a key function in scope), and a row read is safe only
 * when its own path is one of them: a key on `t.node.id` does not cover a
 * row's `t.node.title`, and `${t.meta}` (an object, `[object Object]`) does
 * not cover `t.meta.title`. Precision over silence: a missed report is a row
 * that stays wrong on the web.
 *
 * A key that changes on ANY replacement makes every read safe, so the `<For>`
 * is skipped: the item itself (`(t) => t`) or `JSON.stringify(t)`. A key the
 * walk cannot see into (an imported `keyOf`, `(t) => keyOf(t)`,
 * `keyBy('id')`) keeps reporting, and the message names it (`opaqueKey`): the
 * read is stale unless that function reads the field.
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

/** What a `<For>`'s `by` key reads off its item. */
export interface KeyInfo {
  /** Exact paths the key reads (`id`, `node.id`); a row read on one of them is safe. */
  paths: Set<string>
  /** The key changes on any replacement (`(t) => t`, `JSON.stringify(t)`): no read is stale. */
  always: boolean
  /** A function the walk cannot see into that receives the item (`keyOf`), for the message. */
  opaque: string | undefined
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
  /** The `by` key hands the item to this function, which may read the field. */
  opaqueKey?: string
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

/** `path` is the full read (`node.title`); its first segment is the field a replacement overrides. */
function isReplaced(r: ReplacedFields, path: string, key: KeyInfo): boolean {
  if (key.always || key.paths.has(path)) return false
  const field = path.split('.')[0] as string

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

/** `by={(x) => x.id}` → `id`; undefined for any other shape. Used for the fix text. */
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

type KeyFn = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration

/**
 * The function `name` refers to at `from`, by scope: the innermost block,
 * module or function body that declares it (`const name = (t) => …`,
 * `function name(t) { … }`). Undefined when the nearest binding is a
 * parameter, an import, or anything that is not a function.
 */
function resolveInScope(from: ts.Node, name: string): KeyFn | undefined {
  for (let n: ts.Node | undefined = from.parent; n; n = n.parent) {
    if (isFunctionLike(n) && n.parameters.some((q) => bindsName(q.name, name))) return undefined
    if (!(ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n) || ts.isCaseClause(n))) continue
    for (const st of n.statements) {
      if (ts.isFunctionDeclaration(st) && st.name?.text === name) return st.body ? st : undefined
      if (ts.isImportDeclaration(st) && importsName(st, name)) return undefined
      if (!ts.isVariableStatement(st)) continue
      for (const d of st.declarationList.declarations) {
        if (!bindsName(d.name, name)) continue
        const init = d.initializer && ts.isIdentifier(d.name) ? unwrap(d.initializer) : undefined

        return init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init : undefined
      }
    }
  }

  return undefined
}

function importsName(decl: ts.ImportDeclaration, name: string): boolean {
  const clause = decl.importClause
  if (!clause) return false
  if (clause.name?.text === name) return true
  const b = clause.namedBindings
  if (!b) return false
  if (ts.isNamespaceImport(b)) return b.name.text === name

  return b.elements.some((e) => e.name.text === name)
}

const shortText = (n: ts.Node): string => {
  const text = n.getText().replace(/\s+/g, ' ')

  return text.length > 40 ? `${text.slice(0, 37)}...` : text
}

/**
 * What the `by` key reads off its item (see `KeyInfo`). A key with no item
 * reads at all (`() => 1`, a literal `<For>` would throw on) reads nothing, so
 * every replaced field stays reportable.
 */
function keyInfoOf(by: ts.Expression | undefined): KeyInfo {
  const out: KeyInfo = { paths: new Set(), always: false, opaque: undefined }
  if (!by) return out
  let fn: ts.Expression | KeyFn = unwrap(by)
  if (ts.isIdentifier(fn)) {
    const local = resolveInScope(by, fn.text)
    if (!local) {
      out.opaque = fn.text
      return out
    }
    fn = local
  }
  if (!(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn))) {
    // A call (`keyBy('id')`) or member (`keys.row`) builds a key function the
    // walk cannot see into.
    if (!ts.isLiteralExpression(fn) && !ts.isTemplateExpression(fn)) out.opaque = shortText(fn)
    return out
  }
  const p = fn.parameters[0]
  if (!p || !fn.body) return out
  if (ts.isIdentifier(p.name)) readsOfItem(p.name.text, fn.body, out)
  else if (ts.isObjectBindingPattern(p.name)) patternPaths(p.name, [], fn.body, out)
  else out.opaque = 'the key'

  return out
}

/** Paths a destructuring pattern reads (`{ node: { id } }` → `node.id`). */
function patternPaths(pattern: ts.ObjectBindingPattern, prefix: string[], body: ts.Node, out: KeyInfo): void {
  for (const el of pattern.elements) {
    if (el.dotDotDotToken) {
      // `({ id, ...rest }) => id`: an unused rest reads nothing; a used one
      // reads fields the walk cannot name.
      if (ts.isIdentifier(el.name) && isUsed(body, el.name.text)) out.opaque ??= 'the key'
      continue
    }
    const key = el.propertyName ? propName(el.propertyName) : ts.isIdentifier(el.name) ? el.name.text : undefined
    if (key === undefined) {
      out.opaque ??= 'the key'
      continue
    }
    const path = [...prefix, key]
    if (ts.isObjectBindingPattern(el.name)) patternPaths(el.name, path, body, out)
    else if (ts.isIdentifier(el.name)) addValuePaths(el.name.text, path, body, out)
    else out.opaque ??= 'the key'
  }
}

/**
 * A destructured key value (`({ node }) => node.id`): its own member reads
 * extend the path, a bare use reads the whole value at `path`.
 */
function addValuePaths(name: string, path: string[], body: ts.Node, out: KeyInfo): void {
  let bare = false
  const visit = (n: ts.Node): void => {
    if (ts.isTypeNode(n)) return
    if (isFunctionLike(n) && n.parameters.some((q) => bindsName(q.name, name))) return
    if (ts.isIdentifier(n) && n.text === name && isReference(n)) {
      const chain = memberChain(n)
      if (chain.path.length === 0) bare = true
      else out.paths.add([...path, ...chain.path].join('.'))
    }
    ts.forEachChild(n, visit)
  }
  visit(body)
  if (bare) out.paths.add(path.join('.'))
}

function isUsed(body: ts.Node, name: string): boolean {
  let used = false
  const visit = (n: ts.Node): void => {
    if (used || ts.isTypeNode(n)) return
    if (ts.isIdentifier(n) && n.text === name && isReference(n)) used = true
    else ts.forEachChild(n, visit)
  }
  visit(body)

  return used
}

/** Every read of the key's item param `item` in `body`. */
function readsOfItem(item: string, body: ts.Node, out: KeyInfo): void {
  const ret = ts.isBlock(body) ? body.statements.find(ts.isReturnStatement)?.expression : (body as ts.Expression)
  const returned = ret && unwrap(ret)
  if (returned && ts.isIdentifier(returned) && returned.text === item) {
    out.always = true
    return
  }
  const visit = (n: ts.Node): void => {
    if (ts.isTypeNode(n)) return
    if (isFunctionLike(n) && n.parameters.some((q) => bindsName(q.name, item))) return
    if (ts.isIdentifier(n) && n.text === item && isReference(n)) itemUse(n, body, out)
    ts.forEachChild(n, visit)
  }
  visit(body)
}

/** One use of the key's item: a member read, a destructuring, or the whole item. */
function itemUse(use: ts.Identifier, body: ts.Node, out: KeyInfo): void {
  const chain = memberChain(use)
  if (chain.path.length > 0) {
    out.paths.add(chain.path.join('.'))
    return
  }
  const parent = chain.top.parent
  // `const { id } = t`
  if (ts.isVariableDeclaration(parent) && parent.initializer === chain.top && ts.isObjectBindingPattern(parent.name)) {
    patternPaths(parent.name, [], body, out)
    return
  }
  // `JSON.stringify(t)`: changes whenever any field does.
  if (
    ts.isCallExpression(parent) &&
    parent.arguments[0] === chain.top &&
    ts.isPropertyAccessExpression(parent.expression) &&
    ts.isIdentifier(parent.expression.expression) &&
    parent.expression.expression.text === 'JSON' &&
    parent.expression.name.text === 'stringify'
  ) {
    out.always = true
    return
  }
  if (ts.isCallExpression(parent) && parent.arguments.includes(chain.top as ts.Expression)) {
    out.opaque ??= shortText(parent.expression)
    return
  }
  out.opaque ??= 'the key'
}

const isTransparent = (n: ts.Node): boolean =>
  ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n)

/**
 * The member path read off `use` (`t.node.id` → `node.id`, through `as`, `!`,
 * parentheses and `t['done']`), stopping before a method call (`t.id.trim()`
 * reads `id`; `t.getKey()` reads nothing nameable). `top` is the outermost
 * node of the read.
 */
function memberChain(use: ts.Node): { path: string[]; top: ts.Node } {
  const path: string[] = []
  let cur: ts.Node = use
  for (;;) {
    let parent = cur.parent
    while (isTransparent(parent)) {
      cur = parent
      parent = parent.parent
    }
    let name: string | undefined
    if (ts.isPropertyAccessExpression(parent) && parent.expression === cur) name = parent.name.text
    else if (ts.isElementAccessExpression(parent) && parent.expression === cur) {
      const arg = parent.argumentExpression
      if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) name = arg.text
    }
    if (name === undefined) break
    if (ts.isCallExpression(parent.parent) && parent.parent.expression === parent) break
    path.push(name)
    cur = parent
  }

  return { path, top: cur }
}

/** `n` names a binding in expression position (not a property name or a declaration). */
function isReference(n: ts.Identifier): boolean {
  const parent = n.parent
  if (ts.isPropertyAccessExpression(parent) && parent.name === n) return false
  if (ts.isPropertyAssignment(parent) && parent.name === n) return false
  if (ts.isBindingElement(parent) && parent.propertyName === n) return false
  if (ts.isVariableDeclaration(parent) && parent.name === n) return false
  if (ts.isParameter(parent) && parent.name === n) return false
  // Type positions never get here: every walker skips type nodes first.
  if (ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) return false
  if (ts.isJsxAttribute(parent)) return false

  return true
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
  key: KeyInfo,
): string[] {
  const p = comp.parameters[0]
  if (!p || !comp.body) return []
  const found = new Set<string>()
  const check = (path: string[]): void => {
    if (path.length > 0 && isReplaced(r, path.join('.'), key)) found.add(path[0] as string)
  }
  if (ts.isIdentifier(p.name)) {
    for (const read of findFieldReads(comp.body, p.name.text)) {
      const path = memberChain(read.expression).path
      // `props.todo.done` for an attribute; `props.done` for a spread item.
      if (attr === null) check(path)
      else if (path[0] === attr) check(path.slice(1))
    }
  } else if (ts.isObjectBindingPattern(p.name)) {
    for (const el of p.name.elements) {
      const k = el.propertyName ? propName(el.propertyName) : ts.isIdentifier(el.name) ? el.name.text : undefined
      if (k === undefined) continue
      if (attr === null) {
        for (const path of bindingPaths(el.name, comp.body)) check([k, ...path])
        continue
      }
      if (k !== attr) continue
      for (const path of bindingPaths(el.name, comp.body)) check(path)
    }
  }

  return [...found]
}

/**
 * The paths read through a binding: an identifier's member reads (`todo.done`
 * → `done`; a bare use → the empty path), or a nested pattern's leaves.
 */
function bindingPaths(name: ts.BindingName, body: ts.Node): string[][] {
  if (ts.isIdentifier(name)) {
    const reads = findFieldReads(body, name.text).map((read) => memberChain(read.expression).path)

    return reads.length > 0 ? reads : [[]]
  }
  if (!ts.isObjectBindingPattern(name)) return []
  const out: string[][] = []
  for (const el of name.elements) {
    if (el.dotDotDotToken) continue
    const k = el.propertyName ? propName(el.propertyName) : ts.isIdentifier(el.name) ? el.name.text : undefined
    if (k === undefined) continue
    for (const path of ts.isObjectBindingPattern(el.name) ? bindingPaths(el.name, body) : [[]]) out.push([k, ...path])
  }

  return out
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
      const by = attrExpr(n.openingElement, 'by')
      const key = keyInfoOf(by)
      if (!key.always) {
        const keyField = keyFieldOf(by)
        for (const child of n.children) {
          if (!ts.isJsxExpression(child) || !child.expression) continue
          const fn = unwrap(child.expression)
          if (!(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) continue
          checkRow(fn, key, keyField)
        }
      }
    }
    ts.forEachChild(n, visit)
  }

  const checkRow = (fn: ts.ArrowFunction | ts.FunctionExpression, key: KeyInfo, keyField: string | undefined): void => {
    const extra = key.opaque !== undefined ? { opaqueKey: key.opaque } : {}
    const p = fn.parameters[0]
    if (!p) return
    if (ts.isObjectBindingPattern(p.name)) {
      for (const el of p.name.elements) {
        const k = el.propertyName ? propName(el.propertyName) : ts.isIdentifier(el.name) ? el.name.text : undefined
        if (k === undefined || el.dotDotDotToken) continue
        const leaves = ts.isObjectBindingPattern(el.name) ? bindingPaths(el.name, fn.body) : [[]]
        if (leaves.some((path) => isReplaced(replaced, [k, ...path].join('.'), key))) {
          hits.push({ node: el, kind: 'destructure', param: '{…}', fields: [k], keyField, ...extra })
        }
      }

      return
    }
    if (!ts.isIdentifier(p.name)) return
    const item = p.name.text
    for (const read of findFieldReads(fn.body, item)) {
      if (isReplaced(replaced, memberChain(read.expression).path.join('.'), key)) {
        hits.push({ node: read, kind: 'read', param: item, fields: [read.name.text], keyField, ...extra })
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
              const fields = componentFieldReads(comp, attrName, replaced, key)
              if (fields.length > 0) {
                hits.push({
                  node: a,
                  kind: 'child-prop',
                  param: item,
                  fields,
                  keyField,
                  ...extra,
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
