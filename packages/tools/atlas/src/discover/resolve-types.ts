/**
 * Resolve a props type that lives in ANOTHER file.
 *
 * ── The gap ───────────────────────────────────────────────────────────────
 *
 * `scanSource` reads a props type from an inline literal or a same-file
 * interface. The moment a project does the ordinary thing —
 *
 *     import type { ButtonProps } from './types'
 *     export function Button(props: ButtonProps) { … }
 *
 * — every control came back `unknown`. The component was found; its whole
 * contract was not. That is the shape most real design systems use, so the
 * catalog was at its least useful exactly where it mattered most: no controls
 * to edit, no variant axes, no scenarios beyond the edge cases, and an agent
 * guide that could not say what the component accepts.
 *
 * ── Why this is not a type checker ────────────────────────────────────────
 *
 * A full `ts.Program` would resolve everything — conditional types, mapped
 * types, generics from a third-party package — and cost a program construction
 * per scan plus a real dependency on the project's tsconfig resolution. This
 * does the 90% case instead: follow a RELATIVE import to a file on disk, parse
 * it, and look for the named interface or object type alias.
 *
 * It deliberately does NOT follow imports into `node_modules`. A prop type from
 * a dependency is a legitimate thing to have, but resolving it needs the real
 * module-resolution algorithm, and guessing at it would produce confident wrong
 * answers — which is worse than the honest `unknown` this replaces.
 *
 * ── Bounds ────────────────────────────────────────────────────────────────
 *
 * Depth-bounded and cycle-guarded. `a.ts` re-exporting from `b.ts` re-exporting
 * from `a.ts` is a real shape in barrel-heavy codebases, and a scan must not
 * hang on it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

/** A props type node, as `scanSource` consumes it. */
export type ResolvedTypeNode = ts.TypeLiteralNode | ts.InterfaceDeclaration

/** Extensions tried when a relative specifier carries none. */
const EXTENSIONS = ['.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx', '/index.d.ts']

/** How many import hops to follow before giving up. */
const MAX_DEPTH = 4

/**
 * A file for a relative specifier, or undefined.
 *
 * Bare specifiers (`@acme/ui`, `react`) return undefined by design — see the
 * module comment: resolving into `node_modules` needs the real algorithm.
 */
export function resolveSpecifier(specifier: string, fromFile: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined
  const base = resolve(dirname(fromFile), specifier)
  // An explicit extension wins; `./types.js` is how a TS file under NodeNext
  // refers to `./types.ts`, so that rewrite is tried too.
  if (/\.[jt]sx?$/.test(base)) {
    if (existsSync(base)) return base
    const rewritten = base.replace(/\.jsx?$/, (m) => (m === '.jsx' ? '.tsx' : '.ts'))
    if (rewritten !== base && existsSync(rewritten)) return rewritten
    return undefined
  }
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/** Where a locally-visible type name came from, if it was imported. */
export interface ImportedTypes {
  /** local name → module specifier */
  bySpecifier: Map<string, string>
  /** local name → original exported name (for `import { A as B }`) */
  originalName: Map<string, string>
}

/** Collect the type names this file imports, and where from. */
export function collectImportedTypes(sf: ts.SourceFile): ImportedTypes {
  const bySpecifier = new Map<string, string>()
  const originalName = new Map<string, string>()

  sf.forEachChild((node) => {
    if (!ts.isImportDeclaration(node)) return
    if (!ts.isStringLiteral(node.moduleSpecifier)) return
    const specifier = node.moduleSpecifier.text
    const clause = node.importClause
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return
    for (const element of clause.namedBindings.elements) {
      const local = element.name.text
      bySpecifier.set(local, specifier)
      // `import type { Props as ButtonProps }` — the OTHER file declares
      // `Props`, so looking for `ButtonProps` there would find nothing.
      if (element.propertyName) originalName.set(local, element.propertyName.text)
    }
  })

  return { bySpecifier, originalName }
}

/** The named interface or object type alias declared in a parsed file. */
export function findTypeDeclaration(sf: ts.SourceFile, name: string): ResolvedTypeNode | undefined {
  let found: ResolvedTypeNode | undefined
  sf.forEachChild((node) => {
    if (found) return
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) found = node
    else if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === name &&
      ts.isTypeLiteralNode(node.type)
    ) {
      found = node.type
    }
  })
  return found
}

/**
 * Follow a re-export chain: `export type { Props } from './real'`.
 *
 * Barrel files are the norm in design systems, so without this the common
 * `import type { Props } from './types'` — where `types/index.ts` re-exports
 * from `types/button.ts` — resolves to nothing.
 */
function followReExport(
  sf: ts.SourceFile,
  name: string,
  file: string,
  // The INJECTED resolver, not the real-filesystem one. Taking `resolveSpecifier`
  // directly here left the seam half-wired: a caller supplying a fake disk still
  // hit real `existsSync` for every re-export hop, so barrels were untestable
  // and the two paths could disagree.
  resolveFile: (specifier: string, fromFile: string) => string | undefined,
): { file: string; name: string } | undefined {
  let target: { file: string; name: string } | undefined
  sf.forEachChild((node) => {
    if (target) return
    if (!ts.isExportDeclaration(node) || !node.moduleSpecifier) return
    if (!ts.isStringLiteral(node.moduleSpecifier)) return
    const next = resolveFile(node.moduleSpecifier.text, file)
    if (!next) return
    // `export type { Props } from './x'` — named, so only if this is the name.
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        if (element.name.text !== name) continue
        target = { file: next, name: (element.propertyName ?? element.name).text }
        return
      }
      return
    }
    // `export * from './x'` — the name may be anywhere downstream.
    if (!node.exportClause) target = { file: next, name }
  })
  return target
}

export interface TypeResolverOptions {
  /** Reads a file. Injected so the resolver is testable without a disk. */
  readSource?: (file: string) => string
  /** Resolves a specifier to a file. Injected for the same reason. */
  resolveFile?: (specifier: string, fromFile: string) => string | undefined
}

/**
 * Build a resolver for imported props types.
 *
 * Returned as a closure over a per-scan cache: a design system's components all
 * import from the same two or three type files, so parsing them once per scan
 * rather than once per component is the difference between negligible and
 * quadratic.
 */
export function createTypeResolver(options: TypeResolverOptions = {}) {
  const read = options.readSource ?? ((file: string) => readFileSync(file, 'utf8'))
  const resolveFile = options.resolveFile ?? resolveSpecifier
  const parsed = new Map<string, ts.SourceFile | null>()

  const parse = (file: string): ts.SourceFile | null => {
    const cached = parsed.get(file)
    if (cached !== undefined) return cached
    let sf: ts.SourceFile | null = null
    try {
      const kind = file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, kind)
    } catch {
      sf = null // unreadable or unparseable — an honest `unknown`, not a crash
    }
    parsed.set(file, sf)
    return sf
  }

  /** Look for `name` in `file`, following re-exports. */
  const lookup = (
    file: string,
    name: string,
    depth: number,
    seen: Set<string>,
  ): ResolvedTypeNode | undefined => {
    const key = `${file}#${name}`
    if (depth > MAX_DEPTH || seen.has(key)) return undefined
    seen.add(key)

    const sf = parse(file)
    if (!sf) return undefined

    const direct = findTypeDeclaration(sf, name)
    if (direct) return direct

    // Not declared here — a barrel, or a file that imports it in turn.
    const reExport = followReExport(sf, name, file, resolveFile)
    if (reExport) return lookup(reExport.file, reExport.name, depth + 1, seen)

    const imported = collectImportedTypes(sf)
    const specifier = imported.bySpecifier.get(name)
    if (!specifier) return undefined
    const next = resolveFile(specifier, file)
    if (!next) return undefined
    return lookup(next, imported.originalName.get(name) ?? name, depth + 1, seen)
  }

  /**
   * Resolve `typeName` as imported by `fromFile`, or undefined.
   *
   * `imports` is the importing file's own map, so the caller does not re-parse
   * the file it is already holding.
   */
  return function resolveImportedType(
    typeName: string,
    imports: ImportedTypes,
    fromFile: string,
  ): ResolvedTypeNode | undefined {
    const specifier = imports.bySpecifier.get(typeName)
    if (!specifier) return undefined
    const file = resolveFile(specifier, fromFile)
    if (!file) return undefined
    return lookup(file, imports.originalName.get(typeName) ?? typeName, 0, new Set())
  }
}

export type TypeResolver = ReturnType<typeof createTypeResolver>
