/**
 * Directive islands — `<Counter hydrate="visible" />` sugar.
 *
 * A compile-time rewrite that turns a `hydrate="<strategy>"` attribute on an
 * imported component into a self-hydrating `island()` wrapper, eliminating the
 * manual `island(() => import(...), { name, hydrate })` boilerplate AND the
 * whole duplicate-name / registry-drift / dead-island bug class (the generated
 * name is derived from the file path + component, so it's unique by
 * construction).
 *
 * Pure source → source transform (TS compiler API, mirroring island-audit.ts).
 * The plugin calls this in its transform hook BEFORE the JSX compile; the JSX
 * compiler then sees an ordinary `<__pyIsland_Counter_visible>` component.
 *
 * v1 scope: the component must be IMPORTED (default or named) from a module
 * specifier, and the strategy must be a string literal (or bare `hydrate` =
 * eager `load`). Unsupported shapes (dynamic strategy expression, a local /
 * non-imported component, a member-expression tag like `<Ui.Card>`) are left
 * UNCHANGED and reported as a warning — never silently mis-compiled.
 */
import ts from 'typescript'
import { assertClassicTs } from './ts'

/** A hydration strategy string — same vocabulary as `island({ hydrate })`. */
export type HydrateStrategy = string

export interface DirectiveIsland {
  /** Generated island wrapper variable, e.g. `__pyIsland_Counter_visible`. */
  varName: string
  /** The component's local name at the call site. */
  component: string
  /** Resolved module specifier for the dynamic import. */
  importSource: string
  /** `'default'` for a default import, else the named export to pick. */
  exportName: string
  /** Hydration strategy (the `hydrate` attribute value). */
  hydrate: HydrateStrategy
  /** Stable, file-derived registry name — unique by construction. */
  name: string
}

export interface DirectiveWarning {
  message: string
  line: number
  column: number
}

export interface TransformClientDirectivesResult {
  /** Rewritten source (identical to input when `changed` is false). */
  code: string
  /** The islands the directives lowered to (for the registry). */
  islands: DirectiveIsland[]
  /** True when at least one directive was rewritten. */
  changed: boolean
  /** Unsupported-shape diagnostics (the directive was left as-is). */
  warnings: DirectiveWarning[]
}

const DEFAULT_ISLAND_SOURCE = '@pyreon/server/client'

interface ImportBinding {
  source: string
  /** `'default'` | `'*'` (namespace) | the imported member name */
  exportName: string
}

interface DirectiveSite {
  component: string
  strategy: HydrateStrategy
  binding: ImportBinding
  /** Span of the opening tag name (to rewrite). */
  openTag: { start: number; end: number }
  /** Span of the closing tag name, if any (non-self-closing). */
  closeTag?: { start: number; end: number }
  /** Span of the whole `hydrate=...` attribute incl. leading whitespace (to remove). */
  hydrateAttr: { start: number; end: number }
}

function isPascalCase(name: string): boolean {
  const c = name.charCodeAt(0)
  return c >= 65 && c <= 90 // 'A'..'Z'
}

/** kebab/path-safe slug from a file path: `src/cmp/Cart.tsx` → `src_cmp_Cart`. */
function fileSlug(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/^(?:.*\/)?src\//, '') // drop everything up to and incl. a /src/ (or leading src/)
    .replace(/\.(tsx|jsx|ts|js)$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** FNV-1a 32-bit → 8-char hex — a stable, collision-resistant discriminator. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * A collision-free identifier fragment for a hydration strategy.
 *
 * The readable base (`visible`, `idle`, `media`, `interaction`, …) is the
 * strategy up to the first `(`, but that alone is NOT unique: two parameterized
 * strategies that share a base — `media(min-width: 100px)` vs
 * `media(min-width: 999px)`, or `interaction(click)` vs `interaction(focus)` —
 * would collapse to the same fragment. Since wrappers are deduped by the FULL
 * strategy string, that produced a duplicate `const` (a hard SyntaxError) + a
 * duplicate island `name`. When the strategy carries params (the fragment
 * doesn't capture the whole string), append a stable hash of the full strategy
 * so distinct strategies always get distinct identifiers.
 */
function strategyIdent(strategy: string): string {
  const base = strategy.split('(')[0] ?? strategy
  const frag = base.replace(/[^a-zA-Z0-9]+/g, '') || 'load'
  // If the sanitized WHOLE strategy equals the fragment, it's a bare strategy
  // (`visible`/`idle`/`load`/…) — no hash needed. Otherwise it's parameterized.
  const full = strategy.replace(/[^a-zA-Z0-9]+/g, '')
  return full === frag ? frag : `${frag}_${fnv1a(strategy)}`
}

export function transformClientDirectives(
  code: string,
  filePath: string,
  opts: { islandSource?: string } = {},
): TransformClientDirectivesResult {
  // Fast bail: no `hydrate` attribute anywhere → nothing to do (skips the parse).
  if (!/\bhydrate\b/.test(code)) {
    return { code, islands: [], changed: false, warnings: [] }
  }

  const islandSource = opts.islandSource ?? DEFAULT_ISLAND_SOURCE
  assertClassicTs()
  const sf = ts.createSourceFile(filePath, code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
  const warnings: DirectiveWarning[] = []
  const sites: DirectiveSite[] = []

  // ── 1. Build the import binding map (local name → module + export) ──
  const imports = new Map<string, ImportBinding>()
  let lastImportEnd = 0
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      lastImportEnd = Math.max(lastImportEnd, stmt.getEnd())
      const source = stmt.moduleSpecifier.text
      const clause = stmt.importClause
      if (!clause) continue
      if (clause.name) imports.set(clause.name.text, { source, exportName: 'default' })
      const named = clause.namedBindings
      if (named) {
        if (ts.isNamespaceImport(named)) {
          imports.set(named.name.text, { source, exportName: '*' })
        } else {
          for (const el of named.elements) {
            imports.set(el.name.text, {
              source,
              exportName: el.propertyName?.text ?? el.name.text,
            })
          }
        }
      }
    }
  }

  function posOf(pos: number): { line: number; column: number } {
    const lc = sf.getLineAndCharacterOfPosition(pos)
    return { line: lc.line + 1, column: lc.character + 1 }
  }
  function warn(pos: number, message: string): void {
    warnings.push({ ...posOf(pos), message })
  }

  // ── 2. Walk the JSX for `hydrate` directives ──
  function visit(node: ts.Node): void {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const open = ts.isJsxElement(node) ? node.openingElement : node
      const tag = open.tagName
      const hydrateAttr = open.attributes.properties.find(
        (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === 'hydrate',
      )
      if (hydrateAttr) {
        collectSite(node, open, tag, hydrateAttr)
      }
    }
    ts.forEachChild(node, visit)
  }

  function collectSite(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
    open: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    tag: ts.JsxTagNameExpression,
    hydrateAttr: ts.JsxAttribute,
  ): void {
    // Tag must be a bare PascalCase identifier (a component).
    if (!ts.isIdentifier(tag)) {
      warn(tag.getStart(sf), `hydrate="…" on a non-component tag (${tag.getText(sf)}) — only PascalCase imported components are supported`)
      return
    }
    const name = tag.text
    if (!isPascalCase(name)) {
      warn(tag.getStart(sf), `hydrate="…" on a lowercase tag <${name}> — directives only apply to components`)
      return
    }
    // Strategy: string literal, or bare `hydrate` (= eager load).
    let strategy: string
    const init = hydrateAttr.initializer
    if (init === undefined) {
      strategy = 'load'
    } else if (ts.isStringLiteral(init)) {
      strategy = init.text
    } else if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) {
      strategy = init.expression.text
    } else {
      warn(open.getStart(sf), `<${name} hydrate={…}> — the hydrate strategy must be a string literal (e.g. hydrate="visible"); dynamic values are not supported`)
      return
    }
    const binding = imports.get(name)
    if (!binding) {
      warn(tag.getStart(sf), `<${name} hydrate="…"> — ${name} is not an imported component; directive islands require an imported (code-splittable) component`)
      return
    }
    if (binding.exportName === '*') {
      warn(tag.getStart(sf), `<${name} hydrate="…"> — namespace imports are not supported; import the component directly`)
      return
    }

    const hStart = hydrateAttr.getStart(sf)
    const hEnd = hydrateAttr.getEnd()
    // Eat one leading whitespace so removing the attr doesn't leave a double space.
    let attrStart = hStart
    if (attrStart > 0 && /\s/.test(code[attrStart - 1] as string)) attrStart -= 1

    const site: DirectiveSite = {
      component: name,
      strategy,
      binding,
      openTag: { start: tag.getStart(sf), end: tag.getEnd() },
      hydrateAttr: { start: attrStart, end: hEnd },
    }
    if (ts.isJsxElement(node)) {
      const closeTag = node.closingElement.tagName
      site.closeTag = { start: closeTag.getStart(sf), end: closeTag.getEnd() }
    }
    sites.push(site)
  }

  visit(sf)

  if (sites.length === 0) {
    return { code, islands: [], changed: false, warnings }
  }

  // ── 3. One island wrapper per (component, strategy) ──
  const slug = fileSlug(filePath)
  // A hash of the FULL file path makes the registry `name` unique BY
  // CONSTRUCTION across files — the readable `slug` alone collides when two
  // paths differ only in characters the slug collapses (e.g. `foo-bar/Page` vs
  // `foo_bar/Page` both → `foo_bar_Page`), which would produce a duplicate
  // island `name` the moment those two files' registries merge. `varName` does
  // NOT need it (it's module-scoped — no cross-file collision).
  const fileHash = fnv1a(filePath)
  const islands: DirectiveIsland[] = []
  const wrapperByKey = new Map<string, DirectiveIsland>()
  for (const site of sites) {
    const key = `${site.component}::${site.strategy}`
    let island = wrapperByKey.get(key)
    if (!island) {
      const varName = `__pyIsland_${site.component}_${strategyIdent(site.strategy)}`
      island = {
        varName,
        component: site.component,
        importSource: site.binding.source,
        exportName: site.binding.exportName,
        hydrate: site.strategy,
        name: `${slug}_${site.component}_${strategyIdent(site.strategy)}_${fileHash}`,
      }
      wrapperByKey.set(key, island)
      islands.push(island)
    }
  }

  // ── 4. Emit edits (apply in REVERSE offset order to keep spans valid) ──
  interface Edit {
    start: number
    end: number
    text: string
  }
  const edits: Edit[] = []
  for (const site of sites) {
    const island = wrapperByKey.get(`${site.component}::${site.strategy}`) as DirectiveIsland
    edits.push({ start: site.hydrateAttr.start, end: site.hydrateAttr.end, text: '' })
    edits.push({ start: site.openTag.start, end: site.openTag.end, text: island.varName })
    if (site.closeTag) {
      edits.push({ start: site.closeTag.start, end: site.closeTag.end, text: island.varName })
    }
  }

  // The injected wrapper declarations + the island import, placed right after
  // the last import statement.
  const loaderExpr = (i: DirectiveIsland) =>
    i.exportName === 'default'
      ? `() => import(${JSON.stringify(i.importSource)})`
      : `() => import(${JSON.stringify(i.importSource)}).then((m) => ({ default: m.${i.exportName} }))`
  const decls =
    `\nimport { island as __pyIsland } from ${JSON.stringify(islandSource)}\n` +
    islands
      .map(
        (i) =>
          `const ${i.varName} = /*#__PURE__*/ __pyIsland(${loaderExpr(i)}, { name: ${JSON.stringify(i.name)}, hydrate: ${JSON.stringify(i.hydrate)} })`,
      )
      .join('\n') +
    '\n'
  edits.push({ start: lastImportEnd, end: lastImportEnd, text: decls })

  // Apply highest-offset edit first.
  edits.sort((a, b) => b.start - a.start || b.end - a.end)
  let out = code
  for (const e of edits) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  }

  return { code: out, islands, changed: true, warnings }
}
