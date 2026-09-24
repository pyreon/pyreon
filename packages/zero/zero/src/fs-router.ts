import {
  filePathToUrlPath,
  ROUTE_EXTENSIONS,
  stripRouteExtension,
} from '@pyreon/compiler/fs-route-convention'
import { readFileSync } from 'node:fs'
import { parseSync } from 'oxc-parser'
import { join } from 'node:path'
import type { FileRoute, RenderMode, RouteFileExports } from './types'
import { matchRouteRules } from './route-modes'

// `filePathToUrlPath` + `ROUTE_EXTENSIONS` are the fs-route CONVENTION —
// single-sourced from `@pyreon/compiler/fs-route-convention` (a pure,
// dependency-free subpath; it does NOT pull the compiler barrel / TypeScript
// API) so this router and the project scanner (`@pyreon/compiler`
// `generateContext`) can never drift. The body over there is a
// byte-behavior-identical port of the function that lived here; this file's
// tests keep running against the re-export and
// `fs-route-convention-parity.test.ts` asserts IDENTITY. Do NOT reintroduce
// a local copy.
export { filePathToUrlPath }

/**
 * Return type of a route file's `getStaticPaths()` export. Each entry
 * supplies one set of concrete values for the route's dynamic segments;
 * the SSG plugin expands the route's URL pattern with these params and
 * renders one HTML file per entry.
 *
 * @example
 * ```tsx
 * // src/routes/posts/[id].tsx
 * import type { GetStaticPaths } from '@pyreon/zero/server'
 *
 * export const getStaticPaths: GetStaticPaths<{ id: string }> = async () => {
 *   const posts = await fetch('https://api.example.com/posts').then(r => r.json())
 *   return posts.map((p) => ({ params: { id: p.slug } }))
 * }
 *
 * export default function Post() { ... }
 * ```
 *
 * For catch-all routes (`/blog/[...slug].tsx`), pass the full path through
 * the catch-all param: `{ params: { slug: 'a/b' } }` → `/blog/a/b`.
 */
export type GetStaticPaths<
  TParams extends Record<string, string> = Record<string, string>,
> = () =>
  | Array<{ params: TParams }>
  | Promise<Array<{ params: TParams }>>

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

/** Names whose top-level export presence we care about. */
const ROUTE_EXPORT_NAMES = [
  'loader',
  'guard',
  'meta',
  'renderMode',
  'error',
  'middleware',
  'action',
  'loaderKey',
  'gcTime',
  'getStaticPaths',
  'revalidate',
] as const

type RouteExportName = (typeof ROUTE_EXPORT_NAMES)[number]

/**
 * Detect which optional metadata exports a route file source declares.
 *
 * Parses the file with `oxc-parser` and reads the top-level `export`
 * statements off the AST. This replaced a hand-rolled character scanner
 * that treated every quote as a string opener: an apostrophe in JSX text
 * (`<p>Don't miss</p>`) or a quote inside a regex literal (`/'/g`)
 * desynchronised it and hid every export that followed — a route's
 * `loader`/`renderMode`/`middleware` silently stopped existing. JSX text,
 * regex literals and template literals are exactly the grammar a
 * character scanner cannot model without being a parser, so it is one.
 *
 * Recognizes every ESM named-export form:
 *   • `export const | let | var NAME = …` (incl. destructuring)
 *   • `export function NAME(…)` / `export async function NAME(…)`
 *   • `export class NAME`
 *   • `export { NAME }`, `export { local as NAME }`, `export { NAME } from '…'`
 *   • `export * as NAME from '…'`
 * Type-only exports (`export type`, `export { type X }`, `export declare`)
 * are ignored — they have no runtime value.
 *
 * `filename` only selects the parser dialect (`.ts` keeps `<T>x` casts
 * legal; everything else parses as TSX/JSX). Defaults to TSX.
 */
export function detectRouteExports(source: string, filename = 'route.tsx'): RouteFileExports {
  const found = new Set<RouteExportName>()
  // The statement text that declares each found export — re-parsed on
  // its own below when a literal initializer is wanted.
  const declaringStatement = new Map<RouteExportName, string>()
  const lang = routeLang(filename)

  let staticExports: ReturnType<typeof parseSync>['module']['staticExports']
  try {
    // Read the parser's ESM MODULE RECORD rather than the AST: the record
    // is a flat list of export entries (type-only ones flagged `isType`),
    // and skipping the full AST deserialisation halves the per-file cost.
    staticExports = parseSync(filename, source, { sourceType: 'module', lang }).module
      .staticExports
  } catch {
    // A file the parser cannot even start on is a file Vite will reject
    // with a real diagnostic. Report no exports rather than guessing.
    return { ...EMPTY_EXPORTS, readsRequestAuth: READS_REQUEST_AUTH_RE.test(source) }
  }

  for (const stmt of staticExports) {
    for (const entry of stmt.entries) {
      if (entry.isType || entry.exportName.kind !== 'Name') continue
      const name = entry.exportName.name
      if (name === null || !(ROUTE_EXPORT_NAMES as readonly string[]).includes(name)) continue
      found.add(name as RouteExportName)
      // Only a LOCAL declaration (`export const NAME = …`) carries an
      // initializer; `export { NAME }` / re-exports do not.
      if (entry.moduleRequest === null && entry.localName.name === name) {
        declaringStatement.set(name as RouteExportName, source.slice(stmt.start, stmt.end))
      }
    }
  }

  // Capture literal `meta`, `renderMode` and `revalidate` initializers so
  // the route generator can inline them (and the SSG plugin can build the
  // ISR manifest) without importing the route module. Only a PURE literal
  // qualifies — anything referencing a free identifier would be a
  // ReferenceError once inlined into the generated routes module, so the
  // generator falls back to a static import instead. TypeScript-only
  // wrappers (`as const`, `satisfies T`, `!`) are removed, at any depth:
  // the generated module is plain JavaScript.
  const literalOf = (name: RouteExportName): string | undefined => {
    const stmt = declaringStatement.get(name)
    return stmt === undefined ? undefined : constInitializerLiteral(stmt, name, lang)
  }
  const metaLiteral = literalOf('meta')
  const renderModeLiteral = literalOf('renderMode')
  // PR I — `revalidate` feeds the build-time ISR manifest
  // (`dist/_pyreon-revalidate.json`); it is never inlined into the route
  // record.
  const revalidateLiteral = literalOf('revalidate')

  return {
    hasLoader: found.has('loader'),
    hasGuard: found.has('guard'),
    hasMeta: found.has('meta'),
    hasRenderMode: found.has('renderMode'),
    hasError: found.has('error'),
    hasMiddleware: found.has('middleware'),
    hasAction: found.has('action'),
    hasLoaderKey: found.has('loaderKey'),
    hasGcTime: found.has('gcTime'),
    hasGetStaticPaths: found.has('getStaticPaths'),
    hasRevalidate: found.has('revalidate'),
    readsRequestAuth: READS_REQUEST_AUTH_RE.test(source),
    ...(metaLiteral !== undefined ? { metaLiteral } : {}),
    ...(renderModeLiteral !== undefined ? { renderModeLiteral } : {}),
    ...(revalidateLiteral !== undefined ? { revalidateLiteral } : {}),
  }
}

/**
 * Auth-state reads that make ISR caching per-user-unsafe. Matches the two
 * auth-bearing header reads (`headers.get('cookie')` / `('authorization')`,
 * any casing — header names are case-insensitive) — the same pair the ISR
 * runtime's `Vary: Cookie | Authorization` refusal keys on. Deliberately
 * NOT any-header-read: `headers.get('accept-language')` etc. would flood
 * the warn with benign reads.
 */
const READS_REQUEST_AUTH_RE = /headers\s*\.\s*get\s*\(\s*['"`](?:cookie|authorization)['"`]\s*\)/i

/** Loose ESTree node shape — only the fields read here are relied on. */
interface AstNode {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

function routeLang(filename: string): 'ts' | 'tsx' | 'jsx' {
  if (/\.[mc]?ts$/.test(filename)) return 'ts'
  if (/\.[mc]?jsx?$/.test(filename)) return 'jsx'
  return 'tsx'
}

/**
 * The pure-literal initializer of `export const NAME = …` in `statement`
 * (a single top-level export statement, parsed on its own), or
 * `undefined` for any other shape — `let`/`var`, a function, a
 * destructuring binding, or a non-literal initializer.
 */
function constInitializerLiteral(
  statement: string,
  name: string,
  lang: 'ts' | 'tsx' | 'jsx',
): string | undefined {
  let stmt: AstNode | undefined
  try {
    stmt = parseSync(`stmt.${lang}`, statement, { sourceType: 'module', lang }).program
      .body[0] as unknown as AstNode | undefined
  } catch {
    return undefined
  }
  const decl = stmt?.declaration as AstNode | null | undefined
  if (!decl || decl.type !== 'VariableDeclaration' || decl.kind !== 'const') return undefined
  for (const d of decl.declarations as AstNode[]) {
    const id = d.id as AstNode
    if (id.type === 'Identifier' && id.name === name && d.init) {
      return pureLiteralSource(d.init as AstNode, statement)
    }
  }
  return undefined
}

const TS_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ParenthesizedExpression',
])

/**
 * The JavaScript source of `node` when it is a PURE literal — string,
 * number, boolean, `null`, `undefined`, a negative number, an expression-
 * free template literal, or an object/array composed only of those (plain
 * keys, no spreads, shorthands, methods or computed keys). Returns
 * `undefined` otherwise.
 *
 * TypeScript wrappers are removed wherever they appear, by splicing each
 * wrapper's range with its inner expression's source — so the result is
 * the author's own formatting minus the type syntax.
 */
function pureLiteralSource(node: AstNode, source: string): string | undefined {
  if (TS_WRAPPERS.has(node.type)) return pureLiteralSource(node.expression as AstNode, source)
  const text = (): string => source.slice(node.start, node.end)
  switch (node.type) {
    case 'Literal': {
      const v = node.value
      if (node.regex || node.bigint) return undefined
      return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
        ? text()
        : undefined
    }
    case 'TemplateLiteral':
      return (node.expressions as AstNode[]).length === 0 ? text() : undefined
    case 'Identifier':
      return node.name === 'undefined' ? 'undefined' : undefined
    case 'UnaryExpression': {
      const arg = node.argument as AstNode
      return node.operator === '-' && arg.type === 'Literal' && typeof arg.value === 'number'
        ? text()
        : undefined
    }
    case 'ArrayExpression': {
      const parts: Array<[AstNode, string]> = []
      for (const el of node.elements as Array<AstNode | null>) {
        if (el === null) continue // hole — valid JS as written
        if (el.type === 'SpreadElement') return undefined
        const inner = pureLiteralSource(el, source)
        if (inner === undefined) return undefined
        parts.push([el, inner])
      }
      return splice(node, parts, source)
    }
    case 'ObjectExpression': {
      const parts: Array<[AstNode, string]> = []
      for (const prop of node.properties as AstNode[]) {
        if (prop.type !== 'Property') return undefined // spread
        if (prop.computed || prop.method || prop.shorthand || prop.kind !== 'init') {
          return undefined
        }
        const key = prop.key as AstNode
        if (key.type !== 'Identifier' && key.type !== 'Literal') return undefined
        const value = prop.value as AstNode
        const inner = pureLiteralSource(value, source)
        if (inner === undefined) return undefined
        parts.push([value, inner])
      }
      return splice(node, parts, source)
    }
    default:
      return undefined
  }
}

/** `node`'s source with each child range replaced by its rewritten text. */
function splice(node: AstNode, parts: Array<[AstNode, string]>, source: string): string {
  let out = ''
  let pos = node.start
  for (const [child, text] of parts) {
    out += source.slice(pos, child.start) + text
    pos = child.end
  }
  return out + source.slice(pos, node.end)
}

/** All-false exports record. Used when source detection fails. */
const _warnedNonLiteralMode = new Set<string>()

const EMPTY_EXPORTS: RouteFileExports = {
  hasLoader: false,
  hasGuard: false,
  hasMeta: false,
  hasRenderMode: false,
  hasError: false,
  hasMiddleware: false,
  hasLoaderKey: false,
  hasGcTime: false,
  hasGetStaticPaths: false,
  hasRevalidate: false,
  readsRequestAuth: false,
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
    exports.hasMiddleware ||
    exports.hasLoaderKey ||
    exports.hasGcTime ||
    exports.hasGetStaticPaths
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
  // Remove extension (shared convention helper — `.tsx` > `.jsx` > `.ts` > `.js`)
  const route = stripRouteExtension(filePath)

  const fileName = getFileName(route)
  const isLayout = fileName === '_layout'
  const isError = fileName === '_error'
  const isLoading = fileName === '_loading'
  const isNotFound = fileName === '_404' || fileName === '_not-found'
  const isCatchAll = route.includes('[...')

  // Directory path — KEEP route-group segments. Groups are URL-invisible
  // (filePathToUrlPath strips them) but they are REAL tree boundaries: a
  // `(app)/_layout.tsx` wraps exactly the group's children. The previous
  // group-stripping here collapsed `(app)/` onto the parent directory, so
  // `(app)/_layout.tsx` landed on the SAME tree node as the root
  // `_layout.tsx` — and `placeRoute`'s `node.layout = route` (last-wins)
  // silently clobbered one of them (same class for `_error` / `_loading` /
  // `_404` in groups, and sibling groups clobbered each other). The group
  // layout rendered NOTHING with no error — RouterView → RouterView → page.
  const parts = route.split('/')
  parts.pop() // remove filename
  const dirPath = parts.join('/')

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

// `filePathToUrlPath` lives in `@pyreon/compiler/fs-route-convention` (see the
// import + re-export at the top of this file).

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
  // Loud-clobber guard: each special slot is single-occupancy per tree node.
  // A second file landing in the SAME slot means two files are competing for
  // one position (the historical group-layout bug was exactly this — group
  // stripping in dirPath sent `(app)/_layout` onto the root node, silently
  // replacing the root `_layout`). A filesystem can't produce two `_layout`
  // files in one directory, so any overwrite here is a route-expansion bug —
  // surface it instead of letting one layout vanish without a trace.
  const warnClobber = (slot: string, prev: FileRoute) => {
    if (process.env.NODE_ENV !== 'production') {
      // oxlint-disable-next-line no-console
      console.warn(
        `[Pyreon] fs-router: two ${slot} files resolved to the same route-tree node — ` +
          `"${route.filePath}" is replacing "${prev.filePath}". ` +
          'One of them will not render. This indicates a route-expansion bug (please report it).',
      )
    }
  }
  if (route.isLayout) {
    if (node.layout) warnClobber('_layout', node.layout)
    node.layout = route
  } else if (route.isError) {
    if (node.error) warnClobber('_error', node.error)
    node.error = route
  } else if (route.isLoading) {
    if (node.loading) warnClobber('_loading', node.loading)
    node.loading = route
  } else if (route.isNotFound) {
    if (node.notFound) warnClobber('_404', node.notFound)
    node.notFound = route
  } else node.pages.push(route)
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
  /**
   * Phase 5 — emit `serverLoader: mod.serverLoader` (a real function import
   * of the `.server.ts` sibling) on records that have one. TRUE for SSR
   * builds only; client builds get the serializable `hasServerLoader: true`
   * marker and never import the sibling module.
   */
  serverLoaders?: boolean
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
      exportsMap.set(filePath, detectRouteExports(source, filePath))
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
  // Phase 5 — server loaders. SSR builds import the `.server.ts` sibling
  // and put the FUNCTION on the record; client builds emit only the
  // serializable `hasServerLoader: true` marker, so the sibling module is
  // structurally unreachable from the client bundle (the exclusion
  // guarantee is the import graph itself, not a strip transform).
  const emitServerLoaders = options?.serverLoaders ?? false

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
    // `hmrId` lets `@pyreon/router`'s dev HMR coordinator map a
    // hot-updated module back to its route record(s) for an in-place
    // component swap (no page reload, signals preserved). Inert in
    // production — the coordinator is only registered in a dev browser,
    // so `_hmrId` is dead metadata once built.
    opts.push(`hmrId: ${JSON.stringify(fullPath)}`)
    const optsStr = `, { ${opts.join(', ')} }`
    // JSON.stringify for safe-embed — matches the `hmrId` line above.
    imports.push(`const ${name} = lazy(() => import(${JSON.stringify(fullPath)})${optsStr})`)
    return name
  }

  /**
   * Emit a `meta: { ... }` prop using the literal initializers captured
   * from the route file source. Either or both of `metaLiteral` and
   * `renderModeLiteral` may be present; the result is always a single
   * inline object literal.
   */
  function emitInlineMeta(exp: RouteFileExports, props: string[], indent: string): void {
    if (!exp.hasMeta && !exp.hasRenderMode) return
    const parts: string[] = []
    if (exp.hasMeta && exp.metaLiteral !== undefined) {
      parts.push(`...(${exp.metaLiteral})`)
    }
    if (exp.hasRenderMode && exp.renderModeLiteral !== undefined) {
      parts.push(`renderMode: ${exp.renderModeLiteral}`)
    }
    if (parts.length > 0) {
      props.push(`${indent}  meta: { ${parts.join(', ')} }`)
    }
  }

  /**
   * A COMPUTED `renderMode` (`renderMode: isProd ? 'ssg' : 'ssr'`, a const
   * reference, a function call) still resolves at runtime via the namespace-
   * import fallback — but it can't be inlined (the whole route module joins
   * the eager graph, defeating per-route code splitting) and the FILE-LEVEL
   * mode surfaces (build mode table, dev banner, SSG completeness warning)
   * can't see it. Historically this fallback was completely silent.
   */
  function warnNonLiteralRenderMode(filePath: string, exp: RouteFileExports): void {
    if (!exp.hasRenderMode || exp.renderModeLiteral !== undefined) return
    if (_warnedNonLiteralMode.has(filePath)) return
    _warnedNonLiteralMode.add(filePath)
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] Route "${filePath}" exports a COMPUTED renderMode. It still works at runtime, `
        + `but it cannot be inlined (larger route chunk) and build-time mode surfaces (mode table, `
        + `dev banner, SSG completeness checks) cannot see it. Keep it a plain string literal: `
        + `export const renderMode = 'ssg'`,
    )
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
    warnNonLiteralRenderMode(page.filePath, exp)

    if (useStaticOnly) {
      // SSG / static mode: bundle everything synchronously, no lazy().
      if (hasMeta) {
        // Single namespace import covers component AND metadata.
        const mod = nextModuleImport(page.filePath)
        props.push(`${indent}  component: ${mod}.default`)
        if (exp.hasLoader) props.push(`${indent}  loader: ${mod}.loader`)
        if (exp.hasGuard) props.push(`${indent}  beforeEnter: ${mod}.guard`)
        if (exp.hasLoaderKey) props.push(`${indent}  loaderKey: ${mod}.loaderKey`)
        if (exp.hasGcTime) props.push(`${indent}  gcTime: ${mod}.gcTime`)
        if (exp.hasGetStaticPaths)
          props.push(`${indent}  getStaticPaths: ${mod}.getStaticPaths`)
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
      // SSR/SPA mode: prefer lazy() for code splitting wherever possible.
      //
      // Three cases, in order of preference:
      //   1. metaLiteral / renderModeLiteral are extracted AND there's
      //      no loader/guard/error/middleware → fully lazy. Component
      //      is `lazy()`'d, metadata is inlined as a literal in the
      //      generated module. The route file's entire dependency
      //      graph chunks separately.
      //   2. metaLiteral / renderModeLiteral are extracted but a
      //      function-shaped export (loader/guard/error/middleware)
      //      is also present → mixed: component still lazy, metadata
      //      inlined, function exports come from a static `import * as`.
      //      The static import shares the chunk with the lazy chunk
      //      via Rolldown's deduplication.
      //   3. No literal extraction succeeded → fall back to the previous
      //      pessimistic shape: single namespace import covering both
      //      component and metadata.
      const inlineableMeta =
        (!exp.hasMeta || exp.metaLiteral !== undefined) &&
        (!exp.hasRenderMode || exp.renderModeLiteral !== undefined)
      // getStaticPaths is a build-time export consumed by the SSG plugin's
      // path-resolution phase. Like loader/guard/error, it can't be inlined
      // as a literal — we need the actual function reference. Force the
      // generator into the mixed branch (case 2) when present so a namespace
      // import is emitted and `mod.getStaticPaths` lands on the route record.
      const needsFunctionExports =
        exp.hasLoader || exp.hasGuard || exp.hasError || exp.hasGetStaticPaths

      if (hasMeta && inlineableMeta && !needsFunctionExports) {
        // Optimal path — component lazy, metadata inlined.
        const comp = nextLazy(page.filePath, loadingName, errorName)
        props.push(`${indent}  component: ${comp}`)
        emitInlineMeta(exp, props, indent)
        if (errorName) props.push(`${indent}  errorComponent: ${errorName}`)
      } else if (hasMeta && inlineableMeta) {
        // Mixed — metadata is inlinable but the route also exports
        // function-shaped values (loader/guard/error). Wrap them as
        // lazy thunks so the route file's full dependency tree stays
        // out of the main bundle: each thunk calls the same dynamic
        // import as the lazy() component, and Rolldown deduplicates
        // them into one chunk. Inlining the literal metadata is what
        // makes this safe — without it, the meta access would force
        // a static import that would collide with the dynamic one.
        const comp = nextLazy(page.filePath, loadingName, errorName)
        const fullPath = `${routesDir}/${page.filePath}`
        props.push(`${indent}  component: ${comp}`)
        if (exp.hasLoader) {
          props.push(
            `${indent}  loader: (ctx) => import("${fullPath}").then((m) => m.loader(ctx))`,
          )
        }
        if (exp.hasGuard) {
          props.push(
            `${indent}  beforeEnter: (to, from) => import("${fullPath}").then((m) => m.guard(to, from))`,
          )
        }
        if (exp.hasLoaderKey) {
          // loaderKey runs SYNCHRONOUSLY during the cache-key check; can't be
          // routed through a dynamic import. Inline a `mod.loaderKey` lookup
          // via the same namespace-import pattern as the metadata path. Rolldown
          // will share the chunk with the lazy() component thunk.
          const mod = nextModuleImport(page.filePath)
          props.push(`${indent}  loaderKey: ${mod}.loaderKey`)
        }
        if (exp.hasGcTime) {
          const mod = nextModuleImport(page.filePath)
          props.push(`${indent}  gcTime: ${mod}.gcTime`)
        }
        if (exp.hasGetStaticPaths) {
          // getStaticPaths runs at SSG build time (not request time), so
          // routing it through a dynamic import is fine — but going through
          // a namespace import keeps it consistent with loaderKey/gcTime
          // and avoids per-call import overhead during the SSG enumeration
          // phase.
          const mod = nextModuleImport(page.filePath)
          props.push(`${indent}  getStaticPaths: ${mod}.getStaticPaths`)
        }
        emitInlineMeta(exp, props, indent)
        if (errorName) {
          // For error components we can't easily await — pass the lazy
          // thunk through `lazy()` so the router resolves it like any
          // other lazy component when an error fires.
          const errorRef = exp.hasError
            ? `lazy(() => import("${fullPath}").then((m) => ({ default: m.error })))`
            : errorName
          if (exp.hasError) needsLazyImport = true
          props.push(`${indent}  errorComponent: ${errorRef}`)
        }
      } else if (hasMeta) {
        // Fallback — metadata couldn't be extracted as a literal (e.g.
        // computed values, references to other declarations). Fall
        // back to the pessimistic single-namespace-import shape.
        const mod = nextModuleImport(page.filePath)
        props.push(`${indent}  component: ${mod}.default`)
        if (exp.hasLoader) props.push(`${indent}  loader: ${mod}.loader`)
        if (exp.hasGuard) props.push(`${indent}  beforeEnter: ${mod}.guard`)
        if (exp.hasLoaderKey) props.push(`${indent}  loaderKey: ${mod}.loaderKey`)
        if (exp.hasGcTime) props.push(`${indent}  gcTime: ${mod}.gcTime`)
        if (exp.hasGetStaticPaths)
          props.push(`${indent}  getStaticPaths: ${mod}.getStaticPaths`)
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
        // No metadata at all — pure lazy() for code splitting.
        const comp = nextLazy(page.filePath, loadingName, errorName)
        props.push(`${indent}  component: ${comp}`)
        if (errorName) props.push(`${indent}  errorComponent: ${errorName}`)
      }
    }

    if (notFoundName) {
      props.push(`${indent}  notFoundComponent: ${notFoundName}`)
    }

    // Phase 5 — server loaders (uniform across every emission branch).
    if (exp.serverLoaderFile) {
      props.push(`${indent}  hasServerLoader: true`)
      if (emitServerLoaders) {
        const sMod = nextModuleImport(exp.serverLoaderFile)
        props.push(`${indent}  serverLoader: ${sMod}.serverLoader`)
      }
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
      if (exp.hasLoaderKey) props.push(`${indent}loaderKey: ${layoutMod}.loaderKey`)
      if (exp.hasGcTime) props.push(`${indent}gcTime: ${layoutMod}.gcTime`)
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
 *
 * Detects whether each route file actually exports `middleware` (via
 * `detectRouteExports` source scanning) and only emits an import for files
 * that do. The `lazy()` import path tolerates missing exports, but the SSG
 * static-import path fails Rolldown's missing-export check at build time —
 * skipping no-middleware files keeps both paths working.
 */
export function generateMiddlewareModule(files: string[], routesDir: string): string {
  const routes = parseFileRoutes(files)
  const imports: string[] = []
  const layoutEntries: string[] = []
  const pageEntries: string[] = []
  let counter = 0

  const readExports = (filePath: string): RouteFileExports => {
    try {
      return detectRouteExports(readFileSync(`${routesDir}/${filePath}`, 'utf-8'), filePath)
    } catch {
      // File can't be read — skip; the SSR runtime falls back gracefully.
      return EMPTY_EXPORTS
    }
  }
  const readsMiddleware = (filePath: string): boolean => readExports(filePath).hasMiddleware

  const pages = routes.filter((r) => !r.isLayout && !r.isError && !r.isLoading && !r.isNotFound)

  // A `_layout.tsx` middleware guards its whole subtree. It used to be
  // skipped outright — and silently — while a layout is exactly where a
  // subtree auth gate belongs. Scope is by DIRECTORY, not URL: a group layout
  // (`(app)/_layout.tsx`) has URL path `/`, and a `/`-prefix pattern would
  // wrongly apply it to every route outside the group. So each layout gets
  // ONE entry carrying the URL patterns of the pages inside its directory —
  // one entry, so it runs once per request even when two of those patterns
  // match (`/users/new` and `/users/:id`). Shallow layouts are emitted first,
  // so an outer gate runs before an inner one, and both before the page's.
  const layouts = routes
    .filter((r) => r.isLayout)
    .sort((a, b) => a.dirPath.split('/').filter(Boolean).length - b.dirPath.split('/').filter(Boolean).length)
  for (const layout of layouts) {
    if (!readsMiddleware(layout.filePath)) continue
    const dir = layout.dirPath
    const covered = pages
      .filter((p) => dir === '' || p.dirPath === dir || p.dirPath.startsWith(`${dir}/`))
      .map((p) => p.urlPath)
    if (covered.length === 0) continue
    const name = `_mw${counter++}`
    imports.push(`import { middleware as ${name} } from "${routesDir}/${layout.filePath}"`)
    layoutEntries.push(
      `  { pattern: ${JSON.stringify(covered[0])}, patterns: ${JSON.stringify(covered)}, middleware: ${name} }`,
    )
  }

  for (const route of pages) {
    const exp = readExports(route.filePath)
    const fullPath = `${routesDir}/${route.filePath}`
    if (exp.hasMiddleware) {
      const name = `_mw${counter++}`
      imports.push(`import { middleware as ${name} } from "${fullPath}"`)
      pageEntries.push(`  { pattern: ${JSON.stringify(route.urlPath)}, middleware: ${name} }`)
    }
    // A route-level `action` export handles POSTs to the page — a plain
    // `<form method="post">` works with no JavaScript and no `<Form>`. The
    // marker only POINTS at the action (via ctx.locals); zero's form-action
    // middleware runs it later, after every other middleware — including
    // this page's own — so a route auth gate also gates its action. Placed
    // after the page's middleware entry for the same reason.
    if (exp.hasAction) {
      const name = `_act${counter++}`
      imports.push(`import { action as ${name} } from "${fullPath}"`)
      pageEntries.push(
        `  { pattern: ${JSON.stringify(route.urlPath)}, middleware: (ctx) => { if (ctx.req.method === "POST") ctx.locals["zero:routeAction"] = ${name} } }`,
      )
    }
  }

  return [
    ...imports,
    '',
    `export const routeMiddleware = [`,
    [...layoutEntries, ...pageEntries].join(',\n'),
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
      } else if (
        ROUTE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))
        // Phase 5 — `.server.{ts,js}` siblings are SERVER-ONLY data modules
        // (`export async function serverLoader`), never routes. Excluding
        // them here is what guarantees they can't leak into the client
        // bundle: the client routes module simply never imports them.
        // Phase 5 — exclude `.server.{ts,js,tsx,jsx}` siblings (server-loader
        // data modules) from route scanning. Pre-fix this matched only
        // `.server.[jt]s$`, so a `.server.tsx`/`.jsx` sibling SHIPPED AS A
        // CLIENT ROUTE — silently violating the "never reaches the client
        // bundle" guarantee. All four extensions are now excluded.
        && !/\.server\.[jt]sx?$/.test(entry.name)
      ) {
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

// ─── mode: 'auto' — inference (EXPERIMENTAL) ─────────────────────────────────

/**
 * Infer a page route's render mode from its exports — the conservative
 * "static unless the code says otherwise" model:
 *
 *   revalidate export        → 'isr'  (the route asked for staleness control)
 *   getStaticPaths export    → 'ssg'  (an enumerator is a static-intent signal,
 *                                      even alongside a loader — SSG runs loaders
 *                                      at build)
 *   loader / serverLoader /
 *   guard / middleware       → 'ssr'  (request-coupled work; a loader COULD be
 *                                      build-safe, but inference can't prove it —
 *                                      declare `renderMode = 'ssg'` to opt in)
 *   otherwise                → 'ssg'
 *
 * Explicit declarations (file export or routeRules) always win — inference
 * only fills the undeclared gaps.
 */
export function inferRouteMode(exp: RouteFileExports): RenderMode {
  if (exp.hasRevalidate) return 'isr'
  if (exp.hasGetStaticPaths) return 'ssg'
  if (exp.hasLoader || exp.serverLoaderFile !== undefined || exp.hasGuard || exp.hasMiddleware) return 'ssr'
  return 'ssg'
}

/**
 * Inference-as-declaration: rewrite undeclared PAGE routes so their inferred
 * mode becomes a literal `renderModeLiteral` — the generator then inlines it
 * exactly like a hand-written `export const renderMode`, and the runtime
 * dispatch / build filtering / mode errors need ZERO auto-awareness.
 */
export function applyModeInference(routes: FileRoute[]): FileRoute[] {
  return routes.map((r) => {
    if (r.isLayout || r.isError || r.isLoading || r.isNotFound) return r
    const exp = r.exports
    if (exp?.hasRenderMode) return r
    const inferred = inferRouteMode(exp ?? ({} as RouteFileExports))
    return {
      ...r,
      exports: {
        ...(exp ?? ({} as RouteFileExports)),
        hasRenderMode: true,
        renderModeLiteral: JSON.stringify(inferred),
      },
    }
  })
}

/** One route flagged by {@link detectIsrAuthRisk}. */
export interface IsrAuthRiskEntry {
  filePath: string
  urlPath: string
}

/**
 * Build-time ISR safety check: find routes whose EFFECTIVE mode is `'isr'`
 * and whose source reads request cookie/authorization state (see
 * `RouteFileExports.readsRequestAuth`) — with the default cache key (or the
 * `'path-only'` shorthand) that HTML is cached once and replayed to every
 * user, leaking per-user content. The runtime handler refuses to cache such
 * responses (`Vary: Cookie|Authorization` refusal in `isr.ts`), but that
 * surfaces per-request in production logs; this is the build-time signal
 * that names the file while the author is still editing it.
 *
 * Effective-mode resolution mirrors the runtime cascade at the file level:
 * own literal > nearest ancestor layout literal (deepest wins; group dirs
 * are real tree boundaries) > routeRules glob > app mode. Non-literal
 * (computed) renderMode exports are invisible here — they already get their
 * own build warning.
 *
 * Pure — the caller decides suppression (a custom `isr.cacheKey` FUNCTION
 * means the user opted into per-user caching) and emission.
 */
export function detectIsrAuthRisk(
  routes: FileRoute[],
  appMode: RenderMode,
  rules?: import('./route-modes').RouteRules,
): IsrAuthRiskEntry[] {
  // Layouts with a literal mode, for the cascade walk. dirPath '' covers
  // everything; dirPath 'account' covers 'account' + 'account/…'.
  const layoutModes: Array<{ dirPath: string; mode: string }> = []
  for (const r of routes) {
    if (!r.isLayout) continue
    const lit = r.exports?.renderModeLiteral?.replace(/['"]/g, '')
    if (lit !== undefined) layoutModes.push({ dirPath: r.dirPath, mode: lit })
  }
  const layoutModeFor = (dirPath: string): string | undefined => {
    let best: { dirPath: string; mode: string } | undefined
    for (const l of layoutModes) {
      const covers = l.dirPath === '' || dirPath === l.dirPath || dirPath.startsWith(`${l.dirPath}/`)
      if (covers && (best === undefined || l.dirPath.length > best.dirPath.length)) best = l
    }
    return best?.mode
  }

  const offenders: IsrAuthRiskEntry[] = []
  for (const r of routes) {
    if (r.isLayout || r.isError || r.isLoading || r.isNotFound) continue
    const exp = r.exports
    if (!exp?.readsRequestAuth) continue
    if (!(exp.hasLoader || exp.hasMiddleware || exp.hasGuard)) continue
    const own = exp.renderModeLiteral?.replace(/['"]/g, '')
    const effective = own ?? layoutModeFor(r.dirPath) ?? matchRouteRules(rules, r.urlPath) ?? appMode
    if (effective === 'isr') offenders.push({ filePath: r.filePath, urlPath: r.urlPath })
  }
  return offenders
}

// Module-level dedup so the client + SSR module-graph loads (and dev
// re-scans) warn once per file per process.
const _warnedIsrAuth = new Set<string>()

/** Emit the {@link detectIsrAuthRisk} warning (once per file per process). */
export function warnIsrAuthRisk(offenders: IsrAuthRiskEntry[]): void {
  for (const o of offenders) {
    if (_warnedIsrAuth.has(o.filePath)) continue
    _warnedIsrAuth.add(o.filePath)
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] ISR route "${o.filePath}" reads request cookie/authorization state `
        + `(headers.get('cookie'|'authorization')) but zero({ isr }) has no custom cacheKey `
        + `FUNCTION — the default cache key (and 'path-only') is shared across users, so one `
        + `user's HTML would be cached and replayed to everyone. The runtime refuses to cache `
        + `such responses, making the route effectively uncached SSR. Fix: supply `
        + `isr: { cacheKey: (req) => ... } keyed on the auth state, or drop the auth read, `
        + `or declare export const renderMode = 'ssr' for this route.`,
    )
  }
}

/**
 * The app-level pipeline a `mode: 'auto'` project needs: 'ssr' when ANY page
 * (declared or inferred) requires a server, else pure-static 'ssg'.
 */
export function resolveAutoAppMode(
  routes: FileRoute[],
  rules?: import('./route-modes').RouteRules,
): 'ssr' | 'ssg' {
  const serverModes = new Set(['ssr', 'isr'])
  if (rules && Object.values(rules).some((v) => v.renderMode && serverModes.has(v.renderMode))) {
    return 'ssr'
  }
  for (const r of routes) {
    if (r.isLayout || r.isError || r.isLoading || r.isNotFound) continue
    const lit = r.exports?.renderModeLiteral?.replace(/['"]/g, '')
    if (lit !== undefined) {
      if (serverModes.has(lit)) return 'ssr'
      continue
    }
    if (r.exports?.hasRenderMode) {
      // computed renderMode — can't prove static; a server keeps every
      // declared mode honorable.
      return 'ssr'
    }
    if (serverModes.has(inferRouteMode(r.exports ?? ({} as RouteFileExports)))) return 'ssr'
  }
  return 'ssg'
}

/**
 * Synchronous auto-mode resolution for plugin-factory time (Vite plugin
 * arrays are built before any async hook runs). Reads the routes dir with
 * sync fs — same walk shape as scanRouteFiles. Missing dir → 'ssg'.
 */
export function resolveAutoModeSync(
  routesDir: string,
  rules: import('./route-modes').RouteRules | undefined,
  // fs is INJECTED (not imported) — this module is reachable from the
  // client-safe entry, so it must not carry a static node:fs import, and
  // the built lib is ESM so `require` doesn't exist. The caller
  // (zeroPlugin — server-only) passes the real node:fs.
  fs: Pick<typeof import('node:fs'), 'existsSync' | 'readdirSync' | 'readFileSync' | 'statSync'>,
): { mode: 'ssr' | 'ssg'; pages: number } {
  if (!fs.existsSync(routesDir)) return { mode: 'ssg', pages: 0 }
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir)) {
      const full = `${dir}/${entry}`
      try {
        if (fs.statSync(full).isDirectory()) walk(full)
        else if (
          ROUTE_EXTENSIONS.some((ext) => entry.endsWith(ext))
          && !/\.server\.[jt]sx?$/.test(entry)
        ) {
          files.push(full.slice(routesDir.length + 1))
        }
      } catch {
        /* unreadable entry */
      }
    }
  }
  try {
    walk(routesDir)
  } catch {
    return { mode: 'ssg', pages: 0 }
  }
  const routes = parseFileRoutes(files)
  const withExports = routes.map((r) => {
    try {
      const source = fs.readFileSync(`${routesDir}/${r.filePath}`, 'utf-8')
      return { ...r, exports: detectRouteExports(source, r.filePath) }
    } catch {
      return r
    }
  })
  const pages = withExports.filter(
    (r) => !r.isLayout && !r.isError && !r.isLoading && !r.isNotFound,
  ).length
  return { mode: resolveAutoAppMode(withExports, rules), pages }
}

/** One page route with its file-level effective render mode. */
export interface FileRouteModeEntry {
  /** URL pattern (`/posts/:id`). */
  pattern: string
  /** Effective mode: leaf declaration > nearest ancestor layout > app mode. */
  mode: RenderMode
  /** True when the route (or an ancestor layout) DECLARED the mode. */
  declared: boolean
  /** Source file, relative to the routes dir. */
  filePath: string
}

/**
 * File-level twin of `collectRouteModes` (route-modes.ts): classify every
 * PAGE route's effective render mode straight from the routes directory —
 * no route-module build needed, so the dev banner and both build plugins
 * can print the SAME per-route mode table. Resolution parity contract
 * (leaf declaration > nearest ancestor `_layout` declaration > app mode)
 * is locked by fs-router tests against the runtime resolver's semantics.
 */
export async function collectFileRouteModes(
  routesDir: string,
  appMode: RenderMode | 'auto' = 'ssr',
  rules?: import('./route-modes').RouteRules,
): Promise<FileRouteModeEntry[]> {
  // matchRouteRules comes from the module-level static import — route-modes
  // is a value dep of this module now (detectIsrAuthRisk uses it too).
  const { isApiRoute } = await import('./api-routes')
  const infer = appMode === 'auto'
  const scanMode: RenderMode = infer ? 'ssg' : appMode
  const routes = await scanRouteFilesWithExports(routesDir, scanMode)

  const parseDeclared = (r: FileRoute): RenderMode | undefined => {
    const lit = r.exports?.renderModeLiteral?.replace(/['"]/g, '')
    return lit === 'ssr' || lit === 'ssg' || lit === 'spa' || lit === 'isr' ? lit : undefined
  }

  // Layout declarations cascade to everything under their directory.
  const layoutModes = new Map<string, RenderMode>()
  for (const r of routes) {
    if (!r.isLayout) continue
    const m = parseDeclared(r)
    if (m) layoutModes.set(r.dirPath, m)
  }

  const out: FileRouteModeEntry[] = []
  for (const r of routes) {
    if (r.isLayout || r.isError || r.isLoading || r.isNotFound) continue
    if (isApiRoute(r.filePath)) continue
    if (!r.urlPath) continue
    let mode = parseDeclared(r)
    let declared = mode !== undefined
    if (!mode) {
      // Nearest ancestor layout wins (walk the dir chain upward).
      let dir = r.dirPath
      for (;;) {
        const m = layoutModes.get(dir)
        if (m) {
          mode = m
          declared = true
          break
        }
        if (dir === '') break
        const i = dir.lastIndexOf('/')
        dir = i === -1 ? '' : dir.slice(0, i)
      }
    }
    // Central overrides: file/layout declaration > routeRules > app mode
    // (same precedence as the runtime resolver).
    const ruleMode = mode === undefined ? matchRouteRules(rules, r.urlPath) : undefined
    if (ruleMode !== undefined) {
      mode = ruleMode
      declared = true
    }
    // mode: 'auto' — undeclared routes resolve by inference (same helper the
    // generator uses, so this view matches the built modes exactly).
    if (mode === undefined && infer) {
      mode = inferRouteMode(r.exports ?? ({} as RouteFileExports))
    }
    out.push({
      pattern: r.urlPath,
      mode: mode ?? (appMode as RenderMode),
      declared,
      filePath: r.filePath,
    })
  }
  return out
}

export async function scanRouteFilesWithExports(
  routesDir: string,
  defaultMode: RenderMode = 'ssr',
): Promise<FileRoute[]> {
  const { readFile } = await import('node:fs/promises')
  const { isApiRoute } = await import('./api-routes')

  // Api routes (`api/**/*.ts`) live in the same routes tree but are served by
  // a separate virtual module (`virtual:zero/api-routes`). Page-route
  // generation MUST skip them — they export named HTTP method handlers
  // (`GET`/`POST`/...), not a default page component, so the SSG `staticImports`
  // mode would emit `import _N from "api/posts.ts"` and fail Rolldown's
  // missing-export check at build time. The bug only surfaced under SSG
  // because the regular lazy()-mode `import()` doesn't fail on missing
  // default exports.
  const files = (await scanRouteFiles(routesDir)).filter((f) => !isApiRoute(f))
  const exportsMap = new Map<string, RouteFileExports>()
  const { existsSync } = await import('node:fs')

  await Promise.all(
    files.map(async (filePath) => {
      try {
        const source = await readFile(join(routesDir, filePath), 'utf-8')
        const detected = detectRouteExports(source, filePath)
        // Phase 5 — `.server.ts` sibling = server loader module. Detected
        // here (the scan already touches the fs) so the generator can emit
        // the dual shape: `serverLoader: mod.serverLoader` in the SSR
        // build, `hasServerLoader: true` (a serializable marker) in the
        // client build. A route may not have BOTH a `loader` export and a
        // server-loader sibling — one record carries ONE loader value and
        // silently preferring either would be a trap; fail the build with
        // the fix spelled out.
        // Probe every server-module extension so a `.server.tsx`/`.jsx`
        // sibling is picked up too (it's also excluded from routes above).
        // NOTE: this runs for PAGE routes only — `_layout.server.ts`
        // siblings are NOT picked up (layouts can't carry server loaders;
        // put per-request layout data in a page serverLoader or middleware
        // locals). Documented limitation, not an oversight.
        const base = filePath.replace(/\.[jt]sx?$/, '')
        const serverLoaderFile = ['.server.ts', '.server.tsx', '.server.js', '.server.jsx']
          .map((ext) => `${base}${ext}`)
          .find((candidate) => existsSync(join(routesDir, candidate)))
        if (serverLoaderFile && detected.hasLoader) {
          throw new Error(
            `[Pyreon] Route "${filePath}" exports a \`loader\` AND has a server-loader sibling ("${serverLoaderFile}"). ` +
              `A route carries ONE loader value — move the public fetching into the serverLoader (it can do everything a loader can, plus server-only access) and delete the route's \`loader\` export.`,
          )
        }
        exportsMap.set(
          filePath,
          serverLoaderFile ? { ...detected, serverLoaderFile } : detected,
        )
      } catch (err) {
        // Distinguish the deliberate both-loaders build error (rethrow —
        // it names the fix) from unreadable files (treated as no metadata).
        if (err instanceof Error && err.message.startsWith('[Pyreon]')) throw err
        exportsMap.set(filePath, EMPTY_EXPORTS)
      }
    }),
  )

  return parseFileRoutes(files, defaultMode, exportsMap)
}
