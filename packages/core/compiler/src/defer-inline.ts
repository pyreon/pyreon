/**
 * Inline-children transform for `<Defer>`.
 *
 * Rewrites:
 *
 *     import { Modal } from './Modal'
 *     <Defer when={open()}><Modal /></Defer>
 *
 * into:
 *
 *     <Defer when={open()} chunk={() => import('./Modal').then(m => ({ default: m.Modal }))}>
 *       {C => <C />}
 *     </Defer>
 *
 * The static `import { Modal } from './Modal'` is removed when `Modal` is
 * referenced ONLY inside the Defer subtree — otherwise Rolldown would
 * bundle the module statically and the dynamic import becomes a no-op.
 *
 * Scope of v1 (this file):
 *   - Single Defer element per file (no nested handling — bail otherwise).
 *   - Children: exactly ONE JSXElement, self-closing, capitalised name
 *     (component reference), no props. Props or multiple children → leave
 *     the Defer untransformed (user must use the explicit `chunk` form).
 *   - Imports: named OR default. Namespace imports (`import * as Mod`)
 *     and destructured-renamed (`{ X as Y }`) not handled in v1.
 *   - Triggers (`when={...}`, `on="visible"`, `on="idle"`) pass through.
 *   - Other props on `<Defer>` (e.g. `fallback`) pass through.
 *
 * The transform is intentionally conservative — anything unusual leaves
 * the source unchanged + emits a warning. v2 follow-ups can relax these
 * constraints with closure-capture handling, namespace imports, etc.
 *
 * Pipeline: this runs BEFORE `transformJSX()` in the vite plugin. The
 * output is still JSX — `transformJSX` then converts it to `h()` /
 * `_tpl()` calls as usual.
 */

import { parseSync } from 'oxc-parser'

export interface DeferInlineWarning {
  message: string
  line: number
  column: number
  code:
    | 'defer-inline/multiple-children'
    | 'defer-inline/non-component-child'
    | 'defer-inline/child-has-props'
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

/**
 * Detect the language for `parseSync`. `oxc-parser` infers from filename
 * by extension — we mirror the same logic for the few extensions we
 * support so the parser is invoked correctly.
 */
function getLang(filename: string): 'ts' | 'tsx' | 'js' | 'jsx' {
  if (filename.endsWith('.tsx')) return 'tsx'
  if (filename.endsWith('.jsx')) return 'jsx'
  if (filename.endsWith('.ts')) return 'ts'
  return 'js'
}

/**
 * Returns the JSX tag name as a string when the opening element's name
 * is a simple identifier (the only shape we recognise as a "named JSX
 * element"). Member-expression names (`<obj.X />`) and namespaced names
 * (`<svg:rect />`) return null — the caller treats those as non-matches.
 */
function getJsxName(node: Node): string | null {
  const open = node.openingElement as Node | undefined
  if (!open) return null
  const name = open.name as Node | undefined
  if (!name || name.type !== 'JSXIdentifier') return null
  return name.name as string
}

/**
 * `<Tag />` qualifies as a "bare component reference child" when:
 *   - It's a JSXElement (not text, fragment, or expression container).
 *   - The opening name is a capitalised JSXIdentifier (component).
 *   - It has no attributes (no props passed).
 *   - It's self-closing OR has zero non-whitespace children.
 */
function isBareComponentChild(node: Node): { name: string } | null {
  if (node.type !== 'JSXElement') return null
  const tag = getJsxName(node)
  if (!tag || !/^[A-Z]/.test(tag)) return null
  const open = node.openingElement as Node
  const attrs = (open.attributes as Node[] | undefined) ?? []
  if (attrs.length > 0) return null
  const children = (node.children as Node[] | undefined) ?? []
  for (const child of children) {
    if (child.type === 'JSXText' && /^\s*$/.test(child.value as string)) continue
    return null
  }
  return { name: tag }
}

/**
 * Filter whitespace-only JSXText nodes; return remaining children. JSX
 * source like `<Defer>\n  <Modal />\n</Defer>` has 3 children at the AST
 * level: text, element, text. The text nodes are formatting noise.
 */
function nonWhitespaceChildren(node: Node): Node[] {
  const children = (node.children as Node[] | undefined) ?? []
  return children.filter(
    (c) => !(c.type === 'JSXText' && /^\s*$/.test(c.value as string)),
  )
}

/**
 * `<Defer chunk={...} ...>` qualifies for the inline transform when:
 *   - The opening name is `Defer`.
 *   - No attribute named `chunk` (otherwise user is using the explicit form).
 *   - Exactly ONE non-whitespace child that is a bare component reference.
 */
interface DeferMatch {
  /** The <Defer> JSXElement node. */
  node: Node
  /** The single child component element. */
  child: Node
  /** Component identifier name (e.g. 'Modal'). */
  childName: string
  /** Position where to insert the `chunk` attribute (just after `<Defer`). */
  insertChunkAt: number
  /** Range covering the child JSX element + surrounding whitespace inside Defer's open/close tags. */
  childrenRange: { start: number; end: number }
}

function findDeferMatches(program: Node): DeferMatch[] {
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
        if (live.length === 1) {
          const childInfo = isBareComponentChild(live[0]!)
          if (childInfo) {
            const close = node.closingElement as Node | undefined
            matches.push({
              node,
              child: live[0]!,
              childName: childInfo.name,
              // Insert chunk attribute right after the opening tag name.
              // `<Defer when={x}>` — we want to insert just before the `>`
              // (or `/>` if self-closing, though Defer is never self-closing
              // when it has inline children). Use the closing `>` of the
              // opening tag — that's `open.end - 1` for `<Defer ...>` form.
              insertChunkAt: (open.end as number) - 1,
              childrenRange: {
                start: open.end as number,
                end: (close?.start as number) ?? (node.end as number),
              },
            })
          }
        }
      }
    }

    // Recurse — JSX children, prop expressions, statements, etc.
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
 * Find ImportDeclarations matching a target identifier and classify them.
 * Returns null when the binding can't be resolved or the import shape
 * isn't one we handle (namespace, renamed destructure).
 */
interface ImportInfo {
  /** The `ImportDeclaration` AST node. */
  node: Node
  /** The module source string (without quotes). */
  source: string
  /** 'default' or 'named' — controls how the rewrite resolves the chunk. */
  kind: 'default' | 'named'
}

function findImportFor(program: Node, name: string): ImportInfo | null {
  const body = (program.body as Node[] | undefined) ?? []
  for (const stmt of body) {
    if (stmt.type !== 'ImportDeclaration') continue
    const specifiers = (stmt.specifiers as Node[] | undefined) ?? []
    for (const spec of specifiers) {
      if (spec.type === 'ImportDefaultSpecifier') {
        const local = (spec.local as Node).name as string
        if (local === name) {
          return {
            node: stmt,
            source: (stmt.source as Node).value as string,
            kind: 'default',
          }
        }
      } else if (spec.type === 'ImportSpecifier') {
        const local = (spec.local as Node).name as string
        const imported = (spec.imported as Node | undefined)?.name as string | undefined
        // Only handle the un-renamed case: `import { Modal } from ...`.
        // `{ Modal as M }` — skip (would need to know the original export
        // name for the chunk-resolution path; v1 bails).
        if (local === name && imported !== undefined && imported === local) {
          return {
            node: stmt,
            source: (stmt.source as Node).value as string,
            kind: 'named',
          }
        }
      }
      // ImportNamespaceSpecifier (`import * as M`) — not handled in v1.
    }
  }
  return null
}

/**
 * Count references to `name` outside the given JSXElement subtree. The
 * static import can only be safely removed if the binding is used
 * EXCLUSIVELY inside that subtree.
 */
function countReferencesOutside(program: Node, name: string, skipSubtree: Node): number {
  let count = 0
  const skipStart = skipSubtree.start as number
  const skipEnd = skipSubtree.end as number

  // Walk every statement except ImportDeclarations (we don't want the
  // import specifier itself to count as a usage). Within each statement
  // walk recursively, skipping any subtree whose byte range falls
  // entirely inside the Defer being rewritten.
  const countInNode = (node: Node): void => {
    if (!node || typeof node !== 'object') return
    const ns = node.start as number | undefined
    const ne = node.end as number | undefined
    if (typeof ns === 'number' && typeof ne === 'number' && ns >= skipStart && ne <= skipEnd) {
      return
    }
    if (node.type === 'Identifier' && (node.name as string) === name) count++
    if (node.type === 'JSXIdentifier' && (node.name as string) === name) count++
    for (const key in node) {
      if (key === 'parent') continue
      const v = node[key]
      if (Array.isArray(v)) {
        for (const item of v) countInNode(item as Node)
      } else if (v && typeof v === 'object' && typeof (v as Node).type === 'string') {
        countInNode(v as Node)
      }
    }
  }
  const body = (program.body as Node[] | undefined) ?? []
  for (const stmt of body) {
    if (stmt.type === 'ImportDeclaration') continue
    countInNode(stmt)
  }
  return count
}

/** Build the chunk={...} attribute string for a default or named import. */
function buildChunkAttr(source: string, kind: 'default' | 'named', name: string): string {
  if (kind === 'default') {
    return ` chunk={() => import('${source}')}`
  }
  // Named: re-wrap so the chunk's `default` is the named export.
  return ` chunk={() => import('${source}').then((__m) => ({ default: __m.${name} }))}`
}

/**
 * Apply edits to the source string. Edits MUST be non-overlapping; we
 * sort by start descending and splice each into the source so earlier
 * positions stay valid as we work backwards.
 */
function applyEdits(source: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  let out = source
  for (const e of sorted) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end)
  }
  return out
}

/**
 * Main entry. Returns the (possibly transformed) source plus the list
 * of warnings for cases the transform deliberately skipped.
 *
 * Bails (returns input unchanged with `changed: false`) when:
 *   - No `<Defer>` JSX element appears in the file (fast path).
 *   - The file fails to parse (syntax error — let downstream handle).
 *   - No `<Defer>` matches the inline-eligible shape.
 *
 * Per-Defer skips with a warning:
 *   - Multiple children → user must use render-prop form
 *   - Child has props → user must use render-prop form
 *   - Child name isn't imported → can't resolve the chunk source
 *   - Child binding is used outside the Defer subtree → can't remove
 *     the static import (dynamic import would be a no-op via Rolldown's
 *     same-module dedup)
 */
export function transformDeferInline(
  code: string,
  filename = 'input.tsx',
): DeferInlineResult {
  const warnings: DeferInlineWarning[] = []

  // Fast path — skip the parse entirely when the file has no Defer mention.
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
    // Parse failure — leave to the downstream transformJSX which reports
    // its own diagnostics.
    return { code, changed: false, warnings }
  }

  const matches = findDeferMatches(program)
  if (matches.length === 0) return { code, changed: false, warnings }

  const edits: Edit[] = []
  let changed = false

  for (const m of matches) {
    const importInfo = findImportFor(program, m.childName)
    if (!importInfo) {
      const loc = getLoc(code, (m.child.start as number) ?? 0)
      warnings.push({
        message: `<Defer>'s inline child <${m.childName} /> isn't imported — can't resolve a chunk source. Use the explicit \`chunk\` prop, or import ${m.childName} from a module.`,
        line: loc.line,
        column: loc.column,
        code: 'defer-inline/import-not-found',
      })
      continue
    }

    const outsideUses = countReferencesOutside(program, m.childName, m.node)
    if (outsideUses > 0) {
      const loc = getLoc(code, (m.node.start as number) ?? 0)
      warnings.push({
        message: `<Defer>'s inline child <${m.childName} /> is also referenced elsewhere in this file. Inline form requires the import to be used exclusively inside this Defer. Use the explicit \`chunk\` prop form to split despite shared usage.`,
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
      replacement: buildChunkAttr(importInfo.source, importInfo.kind, m.childName),
    })

    // 2. Replace the children (the bare `<Modal />`) with a render-prop
    //    that invokes the loaded component. Preserve surrounding
    //    whitespace by replacing only the JSX text region inside Defer's
    //    open/close tags. Use a non-letter identifier for the render-prop
    //    binding (`__C`) to avoid clashing with anything in scope.
    edits.push({
      start: m.childrenRange.start,
      end: m.childrenRange.end,
      replacement: `{(__C) => <__C />}`,
    })

    // 3. Remove the static import. Replace the entire ImportDeclaration
    //    range with an empty string. Includes the trailing newline if
    //    present so we don't leave a blank line.
    const impStart = importInfo.node.start as number
    let impEnd = importInfo.node.end as number
    if (code[impEnd] === '\n') impEnd += 1
    edits.push({
      start: impStart,
      end: impEnd,
      replacement: '',
    })

    changed = true
  }

  if (!changed) return { code, changed: false, warnings }

  return { code: applyEdits(code, edits), changed: true, warnings }
}

/** Resolve a byte offset into 1-based line + 0-based column. */
function getLoc(code: string, offset: number): { line: number; column: number } {
  let line = 1
  let lastNl = -1
  for (let i = 0; i < offset && i < code.length; i++) {
    if (code.charCodeAt(i) === 10 /* \n */) {
      line++
      lastNl = i
    }
  }
  return { line, column: offset - lastNl - 1 }
}
