import { createRequire } from 'node:module'
import type { Codemod } from './types'

type TS = typeof import('typescript')
type Node = import('typescript').Node
type Expression = import('typescript').Expression
type CallExpression = import('typescript').CallExpression

/** TypeScript, loaded only when the codemod actually has a candidate file. */
function loadTs(): TS {
  try {
    return createRequire(import.meta.url)('typescript') as TS
  } catch {
    throw new Error(
      '[Pyreon] codemod form-use-form-fields needs the `typescript` package. Install it (it is a peer dependency of @pyreon/cli) and re-run `pyreon upgrade`.',
    )
  }
}

const MODULE = '@pyreon/form'
const IDENT = /^[A-Za-z_$][\w$]*$/

interface FieldCall {
  name: string
  defaultText: string
  validatorText: string | undefined
}

interface Edit {
  start: number
  end: number
  text: string
}

/**
 * `@pyreon/form` 0.55 keeps ONE `useForm` option shape, the documented
 * `useForm({ initialValues, validators, onSubmit, … })`. The second shape,
 * `useForm({ fields: [field('email', '', validate), …] })`, was a translation
 * to the first and is removed together with `field()`.
 *
 * This rewrites `fields: [a, b]` into the equivalent `initialValues: { … }` and
 * `validators: { … }` when EVERY element is either an inline `field(…)` call or
 * a `const x = field(…)` declared in the same file and used nowhere else. The
 * name must be a string literal. Explicit type arguments
 * (`field<'age', number>('age', 0)`) become an `as` cast on the default, so
 * the inferred value type does not change. A declaration that is no longer
 * referenced is removed, and so is the `field` import once nothing uses it.
 * Anything else (definitions imported from another module, a computed name, a
 * spread) is left alone for the type checker to report.
 */
export const formUseFormFields: Codemod = {
  id: 'form-use-form-fields',
  package: '@pyreon/form',
  introducedIn: '0.55.0',
  description:
    'Rewrite the removed `useForm({ fields: [field(…)] })` shape to `useForm({ initialValues, validators })` (same values and validators).',
  matches: (p) => /\.[mc]?[jt]sx?$/.test(p),
  transform(source, relPath) {
    if (!source.includes(MODULE) || !/\bfields\b/.test(source)) return null
    const ts = loadTs()
    const kind = /\.[mc]?tsx$|\.jsx$/.test(relPath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.ESNext, true, kind)

    // Local names bound to `useForm` / `field` from '@pyreon/form'.
    const useFormLocals = new Set<string>()
    const fieldLocals = new Set<string>()
    const fieldSpecifiers: import('typescript').ImportSpecifier[] = []
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
      if (st.moduleSpecifier.text !== MODULE) continue
      const named = st.importClause?.namedBindings
      if (named === undefined || !ts.isNamedImports(named)) continue
      for (const el of named.elements) {
        const imported = (el.propertyName ?? el.name).text
        if (imported === 'useForm') useFormLocals.add(el.name.text)
        if (imported === 'field') {
          fieldLocals.add(el.name.text)
          fieldSpecifiers.push(el)
        }
      }
    }
    if (useFormLocals.size === 0 || fieldLocals.size === 0) return null

    const text = (n: Node): string => n.getText(sf)

    const readFieldCall = (call: CallExpression): FieldCall | undefined => {
      if (!ts.isIdentifier(call.expression) || !fieldLocals.has(call.expression.text)) return undefined
      const [nameArg, defaultArg, validatorArg] = call.arguments
      if (nameArg === undefined || defaultArg === undefined || call.arguments.length > 3) return undefined
      if (!ts.isStringLiteral(nameArg) && !ts.isNoSubstitutionTemplateLiteral(nameArg)) return undefined
      if (call.arguments.some((a) => ts.isSpreadElement(a))) return undefined
      const typeArg = call.typeArguments?.[1]
      const defaultText = typeArg === undefined ? text(defaultArg) : `${parenthesize(defaultArg)} as ${text(typeArg)}`
      return { name: nameArg.text, defaultText, validatorText: validatorArg === undefined ? undefined : text(validatorArg) }
    }

    const parenthesize = (e: Expression): string =>
      ts.isIdentifier(e) ||
      ts.isLiteralExpression(e) ||
      e.kind === ts.SyntaxKind.NullKeyword ||
      e.kind === ts.SyntaxKind.TrueKeyword ||
      e.kind === ts.SyntaxKind.FalseKeyword ||
      ts.isCallExpression(e) ||
      ts.isPropertyAccessExpression(e)
        ? text(e)
        : `(${text(e)})`

    // `const x = field(…)` declarations, resolved by lexical scope: a test file
    // typically declares `const email = field(…)` once per test.
    const fieldDecls = new Map<import('typescript').VariableDeclaration, FieldCall>()
    const visitDecls = (node: Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        ts.isCallExpression(node.initializer) &&
        ts.isVariableDeclarationList(node.parent) &&
        (node.parent.flags & ts.NodeFlags.Const) !== 0
      ) {
        const call = readFieldCall(node.initializer)
        if (call !== undefined) fieldDecls.set(node, call)
      }
      ts.forEachChild(node, visitDecls)
    }
    visitDecls(sf)

    /** The nearest enclosing declaration of `id`'s name (variables and parameters). */
    const resolve = (id: import('typescript').Identifier): Node | undefined => {
      for (let scope: Node | undefined = id.parent; scope !== undefined; scope = scope.parent) {
        if (ts.isFunctionLike(scope)) {
          for (const p of scope.parameters) if (ts.isIdentifier(p.name) && p.name.text === id.text) return p
        }
        const statements =
          ts.isBlock(scope) || ts.isSourceFile(scope) || ts.isModuleBlock(scope) || ts.isCaseClause(scope)
            ? scope.statements
            : undefined
        for (const st of statements ?? []) {
          if (!ts.isVariableStatement(st)) continue
          for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === id.text) return d
        }
      }
      return undefined
    }

    // Every identifier reference, by the declaration it resolves to.
    const refs = new Map<Node, import('typescript').Identifier[]>()
    const fieldRefs: import('typescript').Identifier[] = []
    const visitRefs = (node: Node): void => {
      if (ts.isIdentifier(node)) {
        const p = node.parent
        const isDeclName =
          (ts.isVariableDeclaration(p) || ts.isImportSpecifier(p) || ts.isBindingElement(p) || ts.isParameter(p)) &&
          p.name === node
        const isMember =
          (ts.isPropertyAccessExpression(p) && p.name === node) ||
          (ts.isPropertyAssignment(p) && p.name === node) ||
          (ts.isImportSpecifier(p) && p.propertyName === node)
        if (!isDeclName && !isMember) {
          if (fieldLocals.has(node.text)) fieldRefs.push(node)
          const decl = resolve(node)
          if (decl !== undefined) {
            let list = refs.get(decl)
            if (list === undefined) refs.set(decl, (list = []))
            list.push(node)
          }
        }
      }
      ts.forEachChild(node, visitRefs)
    }
    visitRefs(sf)

    const edits: Edit[] = []
    const consumed = new Set<import('typescript').VariableDeclaration>()

    const visitCalls = (node: Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && useFormLocals.has(node.expression.text)) {
        const opts = node.arguments[0]
        if (opts !== undefined && ts.isObjectLiteralExpression(opts)) rewriteOptions(opts)
      }
      ts.forEachChild(node, visitCalls)
    }

    const rewriteOptions = (opts: import('typescript').ObjectLiteralExpression): void => {
      const keyOf = (p: import('typescript').ObjectLiteralElementLike): string | undefined =>
        p.name !== undefined && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : undefined
      const fieldsProp = opts.properties.find((p) => keyOf(p) === 'fields')
      if (fieldsProp === undefined || !ts.isPropertyAssignment(fieldsProp)) return
      if (opts.properties.some((p) => keyOf(p) === 'initialValues' || keyOf(p) === 'validators')) return
      const arr = fieldsProp.initializer
      if (!ts.isArrayLiteralExpression(arr) || arr.elements.length === 0) return

      const calls: FieldCall[] = []
      const used: import('typescript').VariableDeclaration[] = []
      for (const el of arr.elements) {
        if (ts.isCallExpression(el)) {
          const call = readFieldCall(el)
          if (call === undefined) return
          calls.push(call)
        } else if (ts.isIdentifier(el)) {
          const decl = resolve(el)
          const call = decl !== undefined && ts.isVariableDeclaration(decl) ? fieldDecls.get(decl) : undefined
          // Referenced anywhere but this array: the definition is shared, and
          // rewriting would leave the other use pointing at a removed API.
          if (decl === undefined || call === undefined || (refs.get(decl) ?? []).length !== 1) return
          calls.push(call)
          used.push(decl as import('typescript').VariableDeclaration)
        } else {
          return
        }
      }
      if (new Set(calls.map((c) => c.name)).size !== calls.length) return

      const key = (n: string): string => (IDENT.test(n) ? n : JSON.stringify(n))
      const initial = `initialValues: { ${calls.map((c) => `${key(c.name)}: ${c.defaultText}`).join(', ')} }`
      const withValidator = calls.filter((c) => c.validatorText !== undefined)
      const validators =
        withValidator.length === 0
          ? ''
          : `, validators: { ${withValidator.map((c) => `${key(c.name)}: ${c.validatorText}`).join(', ')} }`
      edits.push({ start: fieldsProp.getStart(sf), end: fieldsProp.getEnd(), text: initial + validators })
      for (const u of used) consumed.add(u)
    }
    visitCalls(sf)
    if (edits.length === 0) return null

    // Remove the declarations the rewrite consumed (the whole statement when it
    // declares nothing else).
    for (const decl of consumed) {
      const list = decl.parent as import('typescript').VariableDeclarationList
      const stmt = list.parent
      if (list.declarations.length === 1 && ts.isVariableStatement(stmt)) {
        edits.push(lineRange(source, stmt.getStart(sf), stmt.getEnd()))
      }
    }

    // Drop the `field` import once only the consumed sites used it.
    const removed = edits.slice()
    const remainingFieldRefs = fieldRefs.filter(
      (id) => !removed.some((e) => id.getStart(sf) >= e.start && id.getEnd() <= e.end),
    ).length
    if (remainingFieldRefs === 0) {
      for (const spec of fieldSpecifiers) {
        const named = spec.parent
        if (named.elements.length === 1) {
          const decl = named.parent.parent
          if (named.parent.name === undefined) edits.push(lineRange(source, decl.getStart(sf), decl.getEnd()))
        } else {
          const idx = named.elements.indexOf(spec)
          const next = named.elements[idx + 1]
          const prev = named.elements[idx - 1]
          if (next !== undefined) edits.push({ start: spec.getStart(sf), end: next.getStart(sf), text: '' })
          else if (prev !== undefined) edits.push({ start: prev.getEnd(), end: spec.getEnd(), text: '' })
        }
      }
    }

    let out = source
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)

    // Removing a run of declarations leaves the blank lines that framed it
    // stacked up; collapse them unless the file already used such runs.
    return /\n\s*\n\s*\n/.test(source) ? out : out.replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
  },
}

/** `[start, end)` widened to whole lines (with the trailing newline). */
function lineRange(source: string, start: number, end: number): Edit {
  const lineStart = source.lastIndexOf('\n', start - 1) + 1
  const onlyIndentBefore = source.slice(lineStart, start).trim() === ''
  let lineEnd = end
  while (lineEnd < source.length && (source[lineEnd] === ' ' || source[lineEnd] === '\t' || source[lineEnd] === ';')) lineEnd++
  if (source[lineEnd] === '\n') lineEnd++
  return { start: onlyIndentBefore ? lineStart : start, end: lineEnd, text: '' }
}
