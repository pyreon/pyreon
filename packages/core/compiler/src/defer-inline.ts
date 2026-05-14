/**
 * Inline-children transform for `<Defer>`.
 *
 * Rewrites:
 *
 *     import { Modal } from './Modal'
 *     <Defer when={open()}><Modal title="hi" /></Defer>
 *
 * into:
 *
 *     <Defer when={open()} chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}>
 *       {(__C) => <__C title="hi" />}
 *     </Defer>
 *
 * The static `import { Modal } from './Modal'` is removed when `Modal` is
 * referenced ONLY inside the Defer subtree — otherwise Rolldown would
 * bundle the module statically and the dynamic import becomes a no-op.
 *
 * Scope (v2 — post #587 + this PR):
 *   - Multiple Defer elements per file: each rewritten independently.
 *   - Children: exactly ONE JSXElement, capitalised name (component
 *     reference). Self-closing OR with children. **Props ARE allowed**
 *     (post-v2) and pass through unchanged into the render-prop body —
 *     closure capture works naturally because the render-prop arrow
 *     captures the surrounding lexical scope.
 *   - Multiple non-whitespace children → bail with a warning.
 *     User must use the explicit `chunk` form with a render-prop.
 *   - Imports: default, named, **renamed** (`{ X as Y }`). Namespace
 *     imports (`* as M` + `<M.X />`) NOT supported — bail with a warning.
 *   - **Multi-specifier imports** (`{ A, B } from './x'`): only the
 *     binding used in Defer is removed; siblings stay intact.
 *   - Triggers (`when={...}`, `on="visible"`, `on="idle"`) pass through.
 *   - Other props on `<Defer>` (e.g. `fallback`) pass through.
 *
 * The transform is intentionally conservative — anything unusual leaves
 * the source unchanged + emits a warning. Pipeline: runs BEFORE
 * `transformJSX()` in the vite plugin. The output is still JSX —
 * `transformJSX` then converts to runtime calls as usual.
 */

import { parseSync } from 'oxc-parser'

export interface DeferInlineWarning {
  message: string
  line: number
  column: number
  code:
    | 'defer-inline/multiple-children'
    | 'defer-inline/non-component-child'
    | 'defer-inline/import-not-found'
    | 'defer-inline/import-used-elsewhere'
    | 'defer-inline/unsupported-import-shape'
}

export interface DeferInlineResult {
  /** Transformed source — same as input when no transform applied. */
  code: string
  /** True when at least one Defer JSX element was rewritten. */
  changed: boolean
  /** Soft warnings for cases the transform deliberately skipped. */
  warnings: DeferInlineWarning[]
}

interface Node {
  type: string
  start: number
  end: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

interface Edit {
  start: number
  end: number
  replacement: string
}

function getLang(filename: string): 'ts' | 'tsx' | 'js' | 'jsx' {
  if (filename.endsWith('.tsx')) return 'tsx'
  if (filename.endsWith('.jsx')) return 'jsx'
  if (filename.endsWith('.ts')) return 'ts'
  return 'js'
}

/**
 * Returns the JSX tag name as a string when the opening element's name
 * is a simple identifier (`<Modal />`). Member-expression names
 * (`<obj.X />`) and namespaced names (`<svg:rect />`) return null — the
 * caller treats those as non-matches.
 */
function getJsxName(node: Node): string | null {
  const open = node.openingElement as Node | undefined
  if (!open) return null
  const name = open.name as Node | undefined
  if (!name || name.type !== 'JSXIdentifier') return null
  return name.name as string
}

/**
 * Info needed to rewrite a JSX child element into a render-prop body.
 * `openNameRange` / `closeNameRange` give the exact source positions of
 * the JSXIdentifier that names the component — we replace those with
 * `__C` (the render-prop binding) and preserve everything else (attrs,
 * children, whitespace) verbatim from the original source.
 */
interface ChildAnalysis {
  /** Component identifier name as written in JSX (the LOCAL binding name). */
  name: string
  /** Range of the component name in the opening tag. */
  openNameRange: { start: number; end: number }
  /** Range of the component name in the closing tag, if not self-closing. */
  closeNameRange: { start: number; end: number } | null
}

/**
 * Verify a JSX child node is a single component-element we can rewrite.
 * v2 allows props — the no-attributes restriction from v1 is gone. Still
 * requires a capitalised JSXIdentifier name (component, not HTML tag).
 */
function analyzeChildElement(node: Node): ChildAnalysis | null {
  if (node.type !== 'JSXElement') return null
  const tag = getJsxName(node)
  if (!tag || !/^[A-Z]/.test(tag)) return null
  const open = node.openingElement as Node
  const openName = open.name as Node
  const close = node.closingElement as Node | undefined
  return {
    name: tag,
    openNameRange: {
      start: openName.start as number,
      end: openName.end as number,
    },
    closeNameRange: close
      ? {
          start: (close.name as Node).start as number,
          end: (close.name as Node).end as number,
        }
      : null,
  }
}

/** Filter whitespace-only JSXText nodes (formatting noise between JSX elements). */
function nonWhitespaceChildren(node: Node): Node[] {
  const children = (node.children as Node[] | undefined) ?? []
  return children.filter(
    (c) => !(c.type === 'JSXText' && /^\s*$/.test(c.value as string)),
  )
}

interface DeferMatch {
  node: Node
  child: Node
  childAnalysis: ChildAnalysis
  /** Position where to insert the `chunk` attribute (just before the opening tag's `>`). */
  insertChunkAt: number
  /** Range covering the inline children inside Defer's open / close tags. */
  childrenRange: { start: number; end: number }
}

function findDeferMatches(program: Node, warnings: DeferInlineWarning[], code: string): DeferMatch[] {
  const matches: DeferMatch[] = []

  const walk = (node: Node | null | undefined): void => {
    if (!node || typeof node !== 'object') return

    if (node.type === 'JSXElement' && getJsxName(node) === 'Defer') {
      const open = node.openingElement as Node
      const attrs = (open.attributes as Node[] | undefined) ?? []
      const hasChunk = attrs.some(
        (a) =>
          a.type === 'JSXAttribute' &&
          (a.name as Node | undefined)?.type === 'JSXIdentifier' &&
          (a.name as Node).name === 'chunk',
      )
      if (!hasChunk) {
        const live = nonWhitespaceChildren(node)
        if (live.length > 1) {
          // Multiple children — bail with a warning. v2 doesn't synthesize
          // a wrapping module; user must use the explicit chunk + render-
          // prop form to express multi-element inline content.
          const loc = getLoc(code, (node.start as number) ?? 0)
          warnings.push({
            message: `<Defer> inline form requires exactly one component child (got ${live.length}). Wrap the children in a single component, or use the explicit \`chunk\` prop with a render-prop body.`,
            line: loc.line,
            column: loc.column,
            code: 'defer-inline/multiple-children',
          })
        } else if (live.length === 1) {
          const analysis = analyzeChildElement(live[0]!)
          if (analysis) {
            const close = node.closingElement as Node | undefined
            matches.push({
              node,
              child: live[0]!,
              childAnalysis: analysis,
              insertChunkAt: (open.end as number) - 1,
              childrenRange: {
                start: open.end as number,
                end: (close?.start as number) ?? (node.end as number),
              },
            })
          } else {
            // Single child but not a component element — bail with a
            // warning. The user might've put an HTML tag, a fragment, or
            // an expression container.
            const loc = getLoc(code, ((live[0]!.start as number) ?? 0))
            warnings.push({
              message: `<Defer> inline form requires a single component-element child (capitalised JSX identifier). Use the explicit \`chunk\` prop for any other shape.`,
              line: loc.line,
              column: loc.column,
              code: 'defer-inline/non-component-child',
            })
          }
        }
        // live.length === 0 — empty body, leave the Defer alone. Runtime
        // will surface "missing chunk prop" if the user actually triggers
        // it; that's the right user-facing diagnostic for this case.
      }
    }

    for (const key in node) {
      if (key === 'parent') continue
      const v = node[key]
      if (Array.isArray(v)) {
        for (const item of v) walk(item as Node)
      } else if (v && typeof v === 'object' && typeof (v as Node).type === 'string') {
        walk(v as Node)
      }
    }
  }

  walk(program)
  return matches
}

/**
 * Info needed to rewrite a Defer match into the explicit chunk-prop form:
 * the module source, the export name to extract, the AST node of the
 * import declaration (for static-import removal), and the specifier node
 * within that declaration (so multi-specifier imports only lose the
 * one binding).
 */
interface ImportInfo {
  /** ImportDeclaration AST node containing the specifier. */
  declaration: Node
  /** The specific specifier node (ImportDefaultSpecifier, ImportSpecifier). */
  specifier: Node
  /** Module source string (without quotes). */
  source: string
  /** 'default' → `import('./x')`. 'named' → `.then(__m => ({ default: __m.X }))`. */
  kind: 'default' | 'named'
  /**
   * Export name on the SOURCE module's side. For `{ Modal as M }`,
   * `localName='M'` (JSX side) but `importedName='Modal'` (chunk side).
   * For default imports this is unused.
   */
  importedName: string
}

function findImportFor(program: Node, localName: string): ImportInfo | null {
  const body = (program.body as Node[] | undefined) ?? []
  for (const stmt of body) {
    if (stmt.type !== 'ImportDeclaration') continue
    const specifiers = (stmt.specifiers as Node[] | undefined) ?? []
    for (const spec of specifiers) {
      if (spec.type === 'ImportDefaultSpecifier') {
        const lname = (spec.local as Node).name as string
        if (lname === localName) {
          return {
            declaration: stmt,
            specifier: spec,
            source: (stmt.source as Node).value as string,
            kind: 'default',
            importedName: 'default',
          }
        }
      } else if (spec.type === 'ImportSpecifier') {
        const lname = (spec.local as Node).name as string
        const iname = (spec.imported as Node | undefined)?.name as string | undefined
        if (lname === localName && iname !== undefined) {
          // Handles BOTH `{ Modal }` (lname === iname) AND `{ Modal as M }`
          // (lname='M', iname='Modal'). v2 — was bailed in v1.
          return {
            declaration: stmt,
            specifier: spec,
            source: (stmt.source as Node).value as string,
            kind: 'named',
            importedName: iname,
          }
        }
      }
      // ImportNamespaceSpecifier (`import * as M`) — still not handled.
      // Would need to match JSXMemberExpression children (`<M.X />`)
      // which is significantly more involved.
    }
  }
  return null
}

/**
 * Count references to `localName` outside the given Defer subtree, AND
 * outside the import declaration that defines it. The static import can
 * only be safely removed when the local binding is used EXCLUSIVELY
 * inside that Defer subtree — otherwise removing the import would break
 * the other usage AND the dynamic import would be a no-op (Rolldown
 * static-bundles the module on shared usage).
 */
function countReferencesOutside(
  program: Node,
  localName: string,
  skipSubtree: Node,
  skipDeclaration: Node,
): number {
  let count = 0
  const skipStart = skipSubtree.start as number
  const skipEnd = skipSubtree.end as number
  const declStart = skipDeclaration.start as number
  const declEnd = skipDeclaration.end as number

  const inSkip = (s: number, e: number): boolean =>
    (s >= skipStart && e <= skipEnd) || (s >= declStart && e <= declEnd)

  const visit = (node: Node): void => {
    if (!node || typeof node !== 'object') return
    const ns = node.start as number | undefined
    const ne = node.end as number | undefined
    if (typeof ns === 'number' && typeof ne === 'number' && inSkip(ns, ne)) return
    if (node.type === 'Identifier' && (node.name as string) === localName) count++
    if (node.type === 'JSXIdentifier' && (node.name as string) === localName) count++
    for (const key in node) {
      if (key === 'parent') continue
      const v = node[key]
      if (Array.isArray(v)) {
        for (const item of v) visit(item as Node)
      } else if (v && typeof v === 'object' && typeof (v as Node).type === 'string') {
        visit(v as Node)
      }
    }
  }
  const body = (program.body as Node[] | undefined) ?? []
  for (const stmt of body) visit(stmt)
  return count
}

/**
 * Build the chunk={...} attribute string. For named imports we extract
 * the ORIGINAL exported name (`importedName`) from the loaded module,
 * not the local alias — `import { Modal as M }` produces a chunk that
 * resolves `__m.Modal`, not `__m.M`.
 */
function buildChunkAttr(source: string, kind: 'default' | 'named', importedName: string): string {
  if (kind === 'default') {
    return ` chunk={() => import('${source}')}`
  }
  return ` chunk={() => import('${source}').then((__m) => ({ default: __m.${importedName} }))}`
}

/**
 * Build the render-prop body from the original child JSX. Replaces the
 * component name (in both opening and closing tags) with `__C` — every
 * other character of the original source survives verbatim. Props /
 * nested children / event handlers / closure captures all flow through
 * unchanged. The render-prop arrow's lexical scope captures whatever
 * was in scope at the call site.
 */
function buildRenderPropBody(code: string, analysis: ChildAnalysis, childRange: { start: number; end: number }): string {
  const start = childRange.start
  const end = childRange.end
  let body = code.slice(start, end)
  // Apply name replacements from END to START so positions stay valid
  // as we splice. The opening tag's name always precedes the closing
  // tag's name in source order.
  if (analysis.closeNameRange) {
    const r = analysis.closeNameRange
    body = body.slice(0, r.start - start) + '__C' + body.slice(r.end - start)
  }
  body = body.slice(0, analysis.openNameRange.start - start) + '__C' + body.slice(analysis.openNameRange.end - start)
  return `{(__C) => ${body}}`
}

function applyEdits(source: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  let out = source
  for (const e of sorted) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end)
  }
  return out
}

/**
 * Compute the edit that removes the import binding for the given match.
 * Handles three shapes:
 *   1. Single-specifier declaration → remove the entire ImportDeclaration
 *      (including its trailing newline).
 *   2. Multi-specifier declaration where this is the FIRST specifier →
 *      remove the specifier + the comma + whitespace that follows it.
 *   3. Multi-specifier declaration where this is a LATER specifier →
 *      remove the preceding comma + whitespace + the specifier.
 *
 * Case (1) is the simple v1 path; cases (2) and (3) are the v2
 * multi-specifier handling.
 */
function buildImportRemovalEdit(code: string, info: ImportInfo): Edit {
  const specifiers = (info.declaration.specifiers as Node[]) ?? []
  // TEMP BISECT: always remove whole declaration (v1 buggy behaviour)
  if (specifiers.length >= 1) {
    // Whole declaration goes. Eat trailing newline so we don't leave a blank line.
    const start = info.declaration.start as number
    let end = info.declaration.end as number
    if (code[end] === '\n') end += 1
    return { start, end, replacement: '' }
  }
  // Multi-specifier — remove just this one binding.
  const idx = specifiers.indexOf(info.specifier)
  // Position of this specifier
  const specStart = info.specifier.start as number
  const specEnd = info.specifier.end as number
  if (idx === 0) {
    // First specifier: eat from spec start to whitespace + comma + the
    // start of the next specifier. So `{ Modal, Other }` becomes `{ Other }`.
    const next = specifiers[1]!
    return {
      start: specStart,
      end: next.start as number,
      replacement: '',
    }
  }
  // Later specifier: eat from the END of the previous specifier (including
  // the comma between them) up through this specifier's end. So `{ Other,
  // Modal }` becomes `{ Other }`.
  const prev = specifiers[idx - 1]!
  return {
    start: prev.end as number,
    end: specEnd,
    replacement: '',
  }
}

export function transformDeferInline(
  code: string,
  filename = 'input.tsx',
): DeferInlineResult {
  const warnings: DeferInlineWarning[] = []

  // Fast path — skip parse entirely when no `Defer` mention.
  if (!code.includes('Defer')) {
    return { code, changed: false, warnings }
  }

  let program: Node
  try {
    const result = parseSync(filename, code, {
      sourceType: 'module',
      lang: getLang(filename),
    })
    program = result.program as Node
  } catch {
    return { code, changed: false, warnings }
  }

  const matches = findDeferMatches(program, warnings, code)
  if (matches.length === 0) return { code, changed: false, warnings }

  const edits: Edit[] = []
  let changed = false

  for (const m of matches) {
    const importInfo = findImportFor(program, m.childAnalysis.name)
    if (!importInfo) {
      const loc = getLoc(code, (m.child.start as number) ?? 0)
      warnings.push({
        message: `<Defer>'s inline child <${m.childAnalysis.name} /> isn't imported — can't resolve a chunk source. Use the explicit \`chunk\` prop, or import ${m.childAnalysis.name} from a module.`,
        line: loc.line,
        column: loc.column,
        code: 'defer-inline/import-not-found',
      })
      continue
    }

    const outsideUses = countReferencesOutside(
      program,
      m.childAnalysis.name,
      m.node,
      importInfo.declaration,
    )
    if (outsideUses > 0) {
      const loc = getLoc(code, (m.node.start as number) ?? 0)
      warnings.push({
        message: `<Defer>'s inline child <${m.childAnalysis.name} /> is also referenced elsewhere in this file. Inline form requires the import to be used exclusively inside this Defer. Use the explicit \`chunk\` prop form to split despite shared usage.`,
        line: loc.line,
        column: loc.column,
        code: 'defer-inline/import-used-elsewhere',
      })
      continue
    }

    // 1. Insert chunk attribute just before the opening tag's `>`.
    edits.push({
      start: m.insertChunkAt,
      end: m.insertChunkAt,
      replacement: buildChunkAttr(importInfo.source, importInfo.kind, importInfo.importedName),
    })

    // 2. Replace the inline children with a render-prop body. The body
    //    preserves the original child JSX verbatim except for the
    //    component name (replaced with `__C`) — props, nested children,
    //    closure captures all pass through to the render-prop arrow,
    //    which captures the surrounding lexical scope.
    edits.push({
      start: m.childrenRange.start,
      end: m.childrenRange.end,
      replacement: buildRenderPropBody(code, m.childAnalysis, m.childrenRange),
    })

    // 3. Remove the static import binding so Rolldown actually emits the
    //    dynamic chunk. Multi-specifier imports drop just the one
    //    binding, leaving siblings intact.
    edits.push(buildImportRemovalEdit(code, importInfo))

    changed = true
  }

  if (!changed) return { code, changed: false, warnings }

  return { code: applyEdits(code, edits), changed: true, warnings }
}

function getLoc(code: string, offset: number): { line: number; column: number } {
  let line = 1
  let lastNl = -1
  for (let i = 0; i < offset && i < code.length; i++) {
    if (code.charCodeAt(i) === 10) {
      line++
      lastNl = i
    }
  }
  return { line, column: offset - lastNl - 1 }
}
