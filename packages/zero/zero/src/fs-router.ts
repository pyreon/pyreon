import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FileRoute, RenderMode, RouteFileExports } from './types'

// ─── File-system route conventions ──────────────────────────────────────────
//
// src/routes/
//   _layout.tsx          → layout for all routes
//   index.tsx            → /
//   about.tsx            → /about
//   users/
//     _layout.tsx        → layout for /users/*
//     _loading.tsx       → loading fallback for /users/*
//     _error.tsx         → error boundary for /users/*
//     index.tsx          → /users
//     [id].tsx           → /users/:id
//     [id]/
//       settings.tsx     → /users/:id/settings
//   blog/
//     [...slug].tsx      → /blog/* (catch-all)
//
// Conventions:
//   [param]     → dynamic segment  → :param
//   [...param]  → catch-all        → :param*
//   _layout     → layout wrapper — must use <RouterView /> to render child routes
//                 (props.children is NOT passed — the router handles nesting)
//   _error      → error component
//   _loading    → loading component
//   _404        → not-found component (renders on 404)
//   _not-found  → alias for _404
//   (group)     → route group (directory ignored in URL)

const ROUTE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js']

/** Names whose top-level export presence we care about. */
const ROUTE_EXPORT_NAMES = [
  'loader',
  'guard',
  'meta',
  'renderMode',
  'error',
  'middleware',
] as const

type RouteExportName = (typeof ROUTE_EXPORT_NAMES)[number]

/**
 * Detect which optional metadata exports a route file source declares.
 *
 * Walks the source character-by-character, tracking string-literal and
 * comment state, then collects top-level `export …` statements. This is
 * more accurate than regex (no false matches inside string literals,
 * template literals, or comments) and lighter than a full AST parse
 * (no oxc/babel dependency, ~1µs per file).
 *
 * Recognizes:
 *   • `export const NAME = …`
 *   • `export let NAME = …`
 *   • `export var NAME = …`
 *   • `export function NAME(…)`
 *   • `export async function NAME(…)`
 *   • `export { NAME }` and `export { localName as NAME }`
 *   • `export { NAME } from '…'` (re-export)
 *
 * Names checked: loader, guard, meta, renderMode, error, middleware.
 */
export function detectRouteExports(source: string): RouteFileExports {
  const found = new Set<RouteExportName>()
  const tokens = scanTopLevelExportTokens(source)

  for (const tok of tokens) {
    if (tok.kind === 'declaration') {
      // `export const NAME` / `export function NAME`
      if ((ROUTE_EXPORT_NAMES as readonly string[]).includes(tok.name)) {
        found.add(tok.name as RouteExportName)
      }
    } else {
      // `export { localName as exportedName, ... }`
      for (const name of tok.names) {
        if ((ROUTE_EXPORT_NAMES as readonly string[]).includes(name)) {
          found.add(name as RouteExportName)
        }
      }
    }
  }

  return {
    hasLoader: found.has('loader'),
    hasGuard: found.has('guard'),
    hasMeta: found.has('meta'),
    hasRenderMode: found.has('renderMode'),
    hasError: found.has('error'),
    hasMiddleware: found.has('middleware'),
  }
}

/**
 * Lightweight tokenizer for the export forms detectRouteExports cares about.
 * Returns an array of either:
 *   • `{ kind: 'declaration', name }` — `export const NAME = …`
 *   • `{ kind: 'list', names }`        — `export { NAME, other as NAME2 }`
 *
 * Only top-level statements (brace depth 0) are considered. String literals,
 * template literals, and comments are skipped so their contents can't trigger
 * false matches.
 */
type ExportToken =
  | { kind: 'declaration'; name: string }
  | { kind: 'list'; names: string[] }

function scanTopLevelExportTokens(source: string): ExportToken[] {
  const tokens: ExportToken[] = []
  const len = source.length
  let i = 0
  let depth = 0 // brace depth — we only care about top-level (depth 0)

  // Identifier characters used to skip past names and to validate that
  // a match isn't a substring of a longer identifier.
  const isIdStart = (c: string) => /[A-Za-z_$]/.test(c)
  const isIdCont = (c: string) => /[A-Za-z0-9_$]/.test(c)

  // Read an identifier starting at position p; returns [name, nextPos] or null.
  const readIdentifier = (p: number): [string, number] | null => {
    if (p >= len || !isIdStart(source[p] as string)) return null
    let end = p + 1
    while (end < len && isIdCont(source[end] as string)) end++
    return [source.slice(p, end), end]
  }

  // Skip whitespace including newlines.
  const skipWs = (p: number): number => {
    while (p < len && /\s/.test(source[p] as string)) p++
    return p
  }

  // Match the literal `keyword` at position p, requiring an identifier
  // boundary on both sides. Returns nextPos or -1.
  const matchKeyword = (p: number, keyword: string): number => {
    if (source.slice(p, p + keyword.length) !== keyword) return -1
    const after = p + keyword.length
    if (after < len && isIdCont(source[after] as string)) return -1
    if (p > 0 && isIdCont(source[p - 1] as string)) return -1
    return after
  }

  while (i < len) {
    const ch = source[i] as string
    const next = source[i + 1] ?? ''

    // ── Comments ──────────────────────────────────────────────────────
    if (ch === '/' && next === '/') {
      // Line comment — skip to newline
      while (i < len && source[i] !== '\n') i++
      continue
    }
    if (ch === '/' && next === '*') {
      // Block comment — skip to closing */
      i += 2
      while (i < len - 1 && !(source[i] === '*' && source[i + 1] === '/')) i++
      i += 2
      continue
    }

    // ── String / template literals ────────────────────────────────────
    if (ch === '"' || ch === "'") {
      const quote = ch
      i++
      while (i < len && source[i] !== quote) {
        if (source[i] === '\\') i += 2
        else i++
      }
      i++
      continue
    }
    if (ch === '`') {
      // Template literal — skip to closing backtick, handling ${...} blocks
      i++
      while (i < len && source[i] !== '`') {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          // Skip a balanced ${ ... } expression
          i += 2
          let exprDepth = 1
          while (i < len && exprDepth > 0) {
            const c = source[i] as string
            if (c === '{') exprDepth++
            else if (c === '}') exprDepth--
            if (exprDepth === 0) {
              i++
              break
            }
            i++
          }
          continue
        }
        i++
      }
      i++
      continue
    }

    // ── Brace depth tracking ──────────────────────────────────────────
    if (ch === '{') {
      depth++
      i++
      continue
    }
    if (ch === '}') {
      depth--
      i++
      continue
    }

    // ── `export …` at top level ──────────────────────────────────────
    if (depth === 0 && ch === 'e') {
      const afterExport = matchKeyword(i, 'export')
      if (afterExport > 0) {
        // Found `export` token at top level. Look at what follows.
        let p = skipWs(afterExport)

        // `export default …` — not a named export we care about
        const afterDefault = matchKeyword(p, 'default')
        if (afterDefault > 0) {
          i = afterDefault
          continue
        }

        // `export { … }` (export list, possibly followed by `from '…'`)
        if (source[p] === '{') {
          p++
          const names: string[] = []
          while (p < len && source[p] !== '}') {
            p = skipWs(p)
            if (source[p] === '}') break
            const id = readIdentifier(p)
            if (!id) {
              p++
              continue
            }
            const [first, afterFirst] = id
            // `localName as exportedName` — the EXPORTED name is what counts
            let exportedName = first
            const afterFirstWs = skipWs(afterFirst)
            const afterAs = matchKeyword(afterFirstWs, 'as')
            if (afterAs > 0) {
              const aliasStart = skipWs(afterAs)
              const alias = readIdentifier(aliasStart)
              if (alias) {
                exportedName = alias[0]
                p = alias[1]
              } else {
                p = afterFirst
              }
            } else {
              p = afterFirst
            }
            names.push(exportedName)
            p = skipWs(p)
            if (source[p] === ',') p++
          }
          tokens.push({ kind: 'list', names })
          i = p + 1 // past closing brace
          continue
        }

        // `export async function NAME …`
        const afterAsync = matchKeyword(p, 'async')
        if (afterAsync > 0) p = skipWs(afterAsync)

        // `export const | let | var | function NAME …`
        let foundDecl = false
        for (const kw of ['const', 'let', 'var', 'function'] as const) {
          const afterKw = matchKeyword(p, kw)
          if (afterKw > 0) {
            const nameStart = skipWs(afterKw)
            const id = readIdentifier(nameStart)
            if (id) {
              tokens.push({ kind: 'declaration', name: id[0] })
              i = id[1] // advance past the identifier we just consumed
              foundDecl = true
              break
            }
          }
        }
        // If we couldn't recognize a declaration form, advance past `export`
        // so the outer loop doesn't re-match the same token forever.
        if (!foundDecl) i = afterExport
        continue
      }
    }

    i++
  }

  return tokens
}

/** All-false exports record. Used when source detection fails. */
const EMPTY_EXPORTS: RouteFileExports = {
  hasLoader: false,
  hasGuard: false,
  hasMeta: false,
  hasRenderMode: false,
  hasError: false,
  hasMiddleware: false,
}

/**
 * True if a route file declares ANY metadata export.
 * Used by the code generator to decide whether to emit a static
 * `import * as mod` (for metadata access) instead of lazy().
 */
export function hasAnyMetaExport(exports: RouteFileExports): boolean {
  return (
    exports.hasLoader ||
    exports.hasGuard ||
    exports.hasMeta ||
    exports.hasRenderMode ||
    exports.hasError ||
    exports.hasMiddleware
  )
}

/**
 * Parse a set of file paths (relative to routes dir) into FileRoute objects.
 *
 * @param files Array of file paths like ["index.tsx", "users/[id].tsx"]
 * @param defaultMode Default rendering mode from config
 * @param exportsMap Optional map of filePath → detected exports. When
 *   provided, the resulting FileRoute objects carry export info that the
 *   code generator uses to optimize imports (skip metadata namespace
 *   imports for routes that only export `default`).
 */
export function parseFileRoutes(
  files: string[],
  defaultMode: RenderMode = 'ssr',
  exportsMap?: Map<string, RouteFileExports>,
): FileRoute[] {
  return files
    .filter((f) => ROUTE_EXTENSIONS.some((ext) => f.endsWith(ext)))
    .map((filePath) => {
      const route = parseFilePath(filePath, defaultMode)
      const exp = exportsMap?.get(filePath)
      return exp ? { ...route, exports: exp } : route
    })
    .sort(sortRoutes)
}

function parseFilePath(filePath: string, defaultMode: RenderMode): FileRoute {
  // Remove extension
  let route = filePath
  for (const ext of ROUTE_EXTENSIONS) {
    if (route.endsWith(ext)) {
      route = route.slice(0, -ext.length)
      break
    }
  }

  const fileName = getFileName(route)
  const isLayout = fileName === '_layout'
  const isError = fileName === '_error'
  const isLoading = fileName === '_loading'
  const isNotFound = fileName === '_404' || fileName === '_not-found'
  const isCatchAll = route.includes('[...')

  // Get directory path (strip groups for consistent grouping)
  const parts = route.split('/')
  parts.pop() // remove filename
  const dirPath = parts.filter((s) => !(s.startsWith('(') && s.endsWith(')'))).join('/')

  // Convert file path to URL pattern
  const urlPath = filePathToUrlPath(route)
  const depth = urlPath === '/' ? 0 : urlPath.split('/').filter(Boolean).length

  return {
    filePath,
    urlPath,
    dirPath,
    depth,
    isLayout,
    isError,
    isLoading,
    isNotFound,
    isCatchAll,
    renderMode: defaultMode,
  }
}

/**
 * Convert a file path (without extension) to a URL path pattern.
 *
 * Examples:
 *   "index"            → "/"
 *   "about"            → "/about"
 *   "users/index"      → "/users"
 *   "users/[id]"       → "/users/:id"
 *   "blog/[...slug]"   → "/blog/:slug*"
 *   "(auth)/login"     → "/login"         (group stripped)
 *   "_layout"          → "/"              (layout marker)
 */
export function filePathToUrlPath(filePath: string): string {
  const segments = filePath.split('/')
  const urlSegments: string[] = []

  for (const seg of segments) {
    // Skip route groups "(name)"
    if (seg.startsWith('(') && seg.endsWith(')')) continue

    // Skip special files
    if (seg === '_layout' || seg === '_error' || seg === '_loading' || seg === '_404' || seg === '_not-found') continue

    // "index" maps to the parent path
    if (seg === 'index') continue

    // Catch-all: [...param] → :param*
    const catchAll = seg.match(/^\[\.\.\.(\w+)\]$/)
    if (catchAll) {
      urlSegments.push(`:${catchAll[1]}*`)
      continue
    }

    // Dynamic: [param] → :param
    const dynamic = seg.match(/^\[(\w+)\]$/)
    if (dynamic) {
      urlSegments.push(`:${dynamic[1]}`)
      continue
    }

    urlSegments.push(seg)
  }

  const path = `/${urlSegments.join('/')}`
  return path || '/'
}

/** Sort routes: static before dynamic, catch-all last. */
function sortRoutes(a: FileRoute, b: FileRoute): number {
  // Catch-all routes go last
  if (a.isCatchAll !== b.isCatchAll) return a.isCatchAll ? 1 : -1
  // Layouts go first within same depth
  if (a.isLayout !== b.isLayout) return a.isLayout ? -1 : 1
  // Static segments before dynamic
  const aDynamic = a.urlPath.includes(':')
  const bDynamic = b.urlPath.includes(':')
  if (aDynamic !== bDynamic) return aDynamic ? 1 : -1
  // Alphabetical
  return a.urlPath.localeCompare(b.urlPath)
}

function getFileName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] ?? ''
}

// ─── Route generation (for Vite plugin) ─────────────────────────────────────

/** Internal tree node for building nested route structures. */
interface RouteNode {
  /** Page routes at this directory level. */
  pages: FileRoute[]
  /** Layout file for this directory (if any). */
  layout?: FileRoute
  /** Error boundary file (if any). */
  error?: FileRoute
  /** Loading fallback file (if any). */
  loading?: FileRoute
  /** Not-found (404) file (if any). */
  notFound?: FileRoute
  /** Child directories. */
  children: Map<string, RouteNode>
}

/**
 * Group flat file routes into a directory tree.
 */
function getOrCreateChild(node: RouteNode, segment: string): RouteNode {
  let child = node.children.get(segment)
  if (!child) {
    child = { pages: [], children: new Map() }
    node.children.set(segment, child)
  }
  return child
}

function resolveNode(root: RouteNode, dirPath: string): RouteNode {
  let node = root
  if (dirPath) {
    for (const segment of dirPath.split('/')) {
      node = getOrCreateChild(node, segment)
    }
  }
  return node
}

function placeRoute(node: RouteNode, route: FileRoute) {
  if (route.isLayout) node.layout = route
  else if (route.isError) node.error = route
  else if (route.isLoading) node.loading = route
  else if (route.isNotFound) node.notFound = route
  else node.pages.push(route)
}

function buildRouteTree(routes: FileRoute[]): RouteNode {
  const root: RouteNode = { pages: [], children: new Map() }
  for (const route of routes) {
    placeRoute(resolveNode(root, route.dirPath), route)
  }
  return root
}

/**
 * Generate a virtual module that exports a nested route tree.
 * Wires up layouts as parent routes with children, loaders, guards,
 * error/loading components, middleware, and meta from route module exports.
 */
export interface GenerateRouteModuleOptions {
  /**
   * When true, skip lazy() for route components and use static imports.
   * Use for SSG/prerender mode where all routes are rendered at build time
   * and code splitting provides no benefit at request time.
   */
  staticImports?: boolean
}

export function generateRouteModule(
  files: string[],
  routesDir: string,
  options?: GenerateRouteModuleOptions,
): string {
  // Synchronously read each route file's source and detect its optional
  // metadata exports. This produces the optimal shape every time:
  //   • `lazy(() => import(...))` for routes with no metadata
  //   • Direct `mod.loader`/`.guard`/`.meta` for routes with metadata
  //   • Zero `IMPORT_IS_UNDEFINED` and zero `INEFFECTIVE_DYNAMIC_IMPORT` warnings
  //
  // If a file can't be read (e.g. caller passing synthetic paths), the
  // FileRoute gets EMPTY_EXPORTS — the generator emits the same lazy()
  // shape used for routes that genuinely have no metadata. Callers that
  // need metadata wiring with synthetic paths should use
  // `generateRouteModuleFromRoutes()` directly with explicit exports.
  const exportsMap = new Map<string, RouteFileExports>()
  for (const filePath of files) {
    if (!ROUTE_EXTENSIONS.some((ext) => filePath.endsWith(ext))) continue
    try {
      const source = readFileSync(join(routesDir, filePath), 'utf-8')
      exportsMap.set(filePath, detectRouteExports(source))
    } catch {
      exportsMap.set(filePath, EMPTY_EXPORTS)
    }
  }
  return generateRouteModuleFromRoutes(
    parseFileRoutes(files, undefined, exportsMap),
    routesDir,
    options,
  )
}

/**
 * Lower-level entry point that accepts pre-parsed FileRoute[] (so callers
 * can attach `.exports` info from source detection). Use this when you've
 * already read the files and want optimal output.
 */
export function generateRouteModuleFromRoutes(
  routes: FileRoute[],
  routesDir: string,
  options?: GenerateRouteModuleOptions,
): string {
  const tree = buildRouteTree(routes)
  const imports: string[] = []
  let importCounter = 0
  const useStaticOnly = options?.staticImports ?? false

  // Track whether we need lazy() at all (omitted in static-only mode and
  // when there are no routes that use it).
  let needsLazyImport = false

  function nextImport(filePath: string, exportName = 'default'): string {
    const name = `_${importCounter++}`
    const fullPath = `${routesDir}/${filePath}`
    if (exportName === 'default') {
      imports.push(`import ${name} from "${fullPath}"`)
    } else {
      imports.push(`import { ${exportName} as ${name} } from "${fullPath}"`)
    }
    return name
  }

  function nextModuleImport(filePath: string): string {
    const name = `_m${importCounter++}`
    const fullPath = `${routesDir}/${filePath}`
    imports.push(`import * as ${name} from "${fullPath}"`)
    return name
  }

  function nextLazy(filePath: string, loadingName?: string, errorName?: string): string {
    const name = `_${importCounter++}`
    const fullPath = `${routesDir}/${filePath}`
    needsLazyImport = true
    const opts: string[] = []
    if (loadingName) opts.push(`loading: ${loadingName}`)
    if (errorName) opts.push(`error: ${errorName}`)
    const optsStr = opts.length > 0 ? `, { ${opts.join(', ')} }` : ''
    imports.push(`const ${name} = lazy(() => import("${fullPath}")${optsStr})`)
    return name
  }

  function generatePageRoute(
    page: FileRoute,
    indent: string,
    loadingName: string | undefined,
    errorName: string | undefined,
    notFoundName: string | undefined,
  ): string {
    const exp = page.exports ?? EMPTY_EXPORTS
    const props: string[] = [`${indent}  path: ${JSON.stringify(page.urlPath)}`]
    const hasMeta = hasAnyMetaExport(exp)

    if (useStaticOnly) {
      // SSG / static mode: bundle everything synchronously, no lazy().
      if (hasMeta) {
        // Single namespace import covers component AND metadata.
        const mod = nextModuleImport(page.filePath)
        props.push(`${indent}  component: ${mod}.default`)
        if (exp.hasLoader) props.push(`${indent}  loader: ${mod}.loader`)
        if (exp.hasGuard) props.push(`${indent}  beforeEnter: ${mod}.guard`)
        if (exp.hasMeta || exp.hasRenderMode) {
          const metaParts: string[] = []
          if (exp.hasMeta) metaParts.push(`...${mod}.meta`)
          if (exp.hasRenderMode) metaParts.push(`renderMode: ${mod}.renderMode`)
          props.push(`${indent}  meta: { ${metaParts.join(', ')} }`)
        }
        if (errorName) {
          const errorRef = exp.hasError ? `${mod}.error || ${errorName}` : errorName
          props.push(`${indent}  errorComponent: ${errorRef}`)
        }
      } else {
        // No metadata — single static default import.
        const comp = nextImport(page.filePath, 'default')
        props.push(`${indent}  component: ${comp}`)
        if (errorName) props.push(`${indent}  errorComponent: ${errorName}`)
      }
    } else {
      // SSR/SPA mode: lazy() for code splitting unless metadata exists.
      if (hasMeta) {
        // Static `import * as` for metadata access. The dual import would
        // collide, so we use the namespace import for the component too —
        // Rolldown's chunker still puts each route in its own chunk.
        const mod = nextModuleImport(page.filePath)
        props.push(`${indent}  component: ${mod}.default`)
        if (exp.hasLoader) props.push(`${indent}  loader: ${mod}.loader`)
        if (exp.hasGuard) props.push(`${indent}  beforeEnter: ${mod}.guard`)
        if (exp.hasMeta || exp.hasRenderMode) {
          const metaParts: string[] = []
          if (exp.hasMeta) metaParts.push(`...${mod}.meta`)
          if (exp.hasRenderMode) metaParts.push(`renderMode: ${mod}.renderMode`)
          props.push(`${indent}  meta: { ${metaParts.join(', ')} }`)
        }
        if (errorName) {
          const errorRef = exp.hasError ? `${mod}.error || ${errorName}` : errorName
          props.push(`${indent}  errorComponent: ${errorRef}`)
        }
      } else {
        // No metadata — pure lazy() for code splitting.
        const comp = nextLazy(page.filePath, loadingName, errorName)
        props.push(`${indent}  component: ${comp}`)
        if (errorName) props.push(`${indent}  errorComponent: ${errorName}`)
      }
    }

    if (notFoundName) {
      props.push(`${indent}  notFoundComponent: ${notFoundName}`)
    }

    return `${indent}{\n${props.join(',\n')}\n${indent}}`
  }

  function wrapWithLayout(
    node: RouteNode,
    children: string[],
    indent: string,
    errorName: string | undefined,
    notFoundName: string | undefined,
  ): string {
    const layout = node.layout as FileRoute
    const exp = layout.exports ?? EMPTY_EXPORTS
    const hasMeta = hasAnyMetaExport(exp)

    // Decide between two import shapes:
    //   • Layout HAS metadata exports → single `import * as mod` for both
    //     the layout component (mod.layout) AND metadata. One import.
    //   • Layout has NO metadata → just `import { layout as _N }`. One import.
    let layoutComp: string
    let layoutMod: string | undefined

    if (hasMeta) {
      // Single namespace import covers both component and metadata.
      layoutMod = nextModuleImport(layout.filePath)
      layoutComp = `${layoutMod}.layout`
    } else {
      // No metadata — named `layout` import is enough.
      layoutComp = nextImport(layout.filePath, 'layout')
    }

    const props: string[] = [
      `${indent}path: ${JSON.stringify(layout.urlPath)}`,
      `${indent}component: ${layoutComp}`,
    ]

    if (layoutMod !== undefined) {
      if (exp.hasLoader) props.push(`${indent}loader: ${layoutMod}.loader`)
      if (exp.hasGuard) props.push(`${indent}beforeEnter: ${layoutMod}.guard`)
      if (exp.hasMeta || exp.hasRenderMode) {
        const metaParts: string[] = []
        if (exp.hasMeta) metaParts.push(`...${layoutMod}.meta`)
        if (exp.hasRenderMode) metaParts.push(`renderMode: ${layoutMod}.renderMode`)
        props.push(`${indent}meta: { ${metaParts.join(', ')} }`)
      }
    }

    if (errorName) {
      props.push(`${indent}errorComponent: ${errorName}`)
    }
    if (notFoundName) {
      props.push(`${indent}notFoundComponent: ${notFoundName}`)
    }
    if (children.length > 0) {
      props.push(`${indent}children: [\n${children.join(',\n')}\n${indent}]`)
    }

    return `${indent}{\n${props.map((p) => `  ${p}`).join(',\n')}\n${indent}}`
  }

  /**
   * Generate route definitions for a tree node.
   */
  function generateNode(node: RouteNode, depth: number): string[] {
    const indent = '  '.repeat(depth + 1)

    const errorName = node.error ? nextImport(node.error.filePath) : undefined
    const loadingName = node.loading ? nextImport(node.loading.filePath) : undefined
    const notFoundName = node.notFound ? nextImport(node.notFound.filePath) : undefined

    const childRouteDefs: string[] = []
    for (const [, childNode] of node.children) {
      childRouteDefs.push(...generateNode(childNode, depth + 1))
    }

    const pageRouteDefs = node.pages.map((page) =>
      generatePageRoute(page, indent, loadingName, errorName, notFoundName),
    )

    const allChildren = [...pageRouteDefs, ...childRouteDefs]

    if (node.layout) {
      return [wrapWithLayout(node, allChildren, indent, errorName, notFoundName)]
    }
    return allChildren
  }

  const routeDefs = generateNode(tree, 0)

  const lines: string[] = []
  if (needsLazyImport) lines.push(`import { lazy } from "@pyreon/router"`, '')
  lines.push(...imports, '')

  lines.push(
    // Filter out undefined properties at runtime
    `function clean(routes) {`,
    `  return routes.map(r => {`,
    `    const c = {}`,
    `    for (const k in r) if (r[k] !== undefined) c[k] = r[k]`,
    `    if (c.children) c.children = clean(c.children)`,
    `    return c`,
    `  })`,
    `}`,
    '',
    `export const routes = clean([`,
    routeDefs.join(',\n'),
    `])`,
  )

  return lines.join('\n')
}

/**
 * Generate a virtual module that maps URL patterns to their middleware exports.
 * Used by the server entry to dispatch per-route middleware.
 */
export function generateMiddlewareModule(files: string[], routesDir: string): string {
  const routes = parseFileRoutes(files)
  const imports: string[] = []
  const entries: string[] = []
  let counter = 0

  for (const route of routes) {
    if (route.isLayout || route.isError || route.isLoading || route.isNotFound) continue
    const name = `_mw${counter++}`
    const fullPath = `${routesDir}/${route.filePath}`
    imports.push(`import { middleware as ${name} } from "${fullPath}"`)
    entries.push(`  { pattern: ${JSON.stringify(route.urlPath)}, middleware: ${name} }`)
  }

  return [
    ...imports,
    '',
    `export const routeMiddleware = [`,
    entries.join(',\n'),
    `].filter(e => e.middleware)`,
  ].join('\n')
}

/**
 * Scan a directory for route files.
 * Returns paths relative to the routes directory.
 */
export async function scanRouteFiles(routesDir: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises')
  const { relative } = await import('node:path')

  const files: string[] = []

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (ROUTE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        files.push(relative(routesDir, fullPath))
      }
    }
  }

  await walk(routesDir)
  return files
}

/**
 * Scan route files AND read each one to detect optional metadata exports
 * (loader, guard, meta, renderMode, error, middleware).
 *
 * Returns FileRoute[] with `.exports` populated, ready to feed into
 * `generateRouteModuleFromRoutes()` for optimal output:
 *   • lazy() for components without metadata (best code splitting)
 *   • Direct property access for components with metadata (no _pick)
 *   • No spurious IMPORT_IS_UNDEFINED warnings
 */
export async function scanRouteFilesWithExports(
  routesDir: string,
  defaultMode: RenderMode = 'ssr',
): Promise<FileRoute[]> {
  const { readFile } = await import('node:fs/promises')

  const files = await scanRouteFiles(routesDir)
  const exportsMap = new Map<string, RouteFileExports>()

  await Promise.all(
    files.map(async (filePath) => {
      try {
        const source = await readFile(join(routesDir, filePath), 'utf-8')
        exportsMap.set(filePath, detectRouteExports(source))
      } catch {
        // File can't be read — generator treats this as no metadata
        // and emits the optimal lazy() shape.
        exportsMap.set(filePath, EMPTY_EXPORTS)
      }
    }),
  )

  return parseFileRoutes(files, defaultMode, exportsMap)
}
