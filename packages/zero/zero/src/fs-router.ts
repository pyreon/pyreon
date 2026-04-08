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

/**
 * Detect which optional metadata exports a route file source contains.
 * Uses regex (not full AST parsing) — we only need to know IF a top-level
 * `export const X` / `export function X` / `export async function X`
 * exists for the recognized names. False positives are harmless: the
 * code generator will emit references to exports that exist.
 *
 * Names checked: loader, guard, meta, renderMode, error, middleware
 */
export function detectRouteExports(source: string): RouteFileExports {
  // Strip line comments and block comments to avoid matching inside them.
  // Cheap pass — not perfect (string literals containing `export const meta`
  // would slip through) but good enough since false positives are harmless.
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')

  const hasNamedExport = (name: string): boolean => {
    // Match `export const NAME`, `export let NAME`, `export var NAME`,
    // `export function NAME`, `export async function NAME` at start of line
    // (allowing leading whitespace).
    const re = new RegExp(
      `^\\s*export\\s+(?:async\\s+)?(?:const|let|var|function)\\s+${name}\\b`,
      'm',
    )
    return re.test(stripped)
  }

  return {
    hasLoader: hasNamedExport('loader'),
    hasGuard: hasNamedExport('guard'),
    hasMeta: hasNamedExport('meta'),
    hasRenderMode: hasNamedExport('renderMode'),
    hasError: hasNamedExport('error'),
    hasMiddleware: hasNamedExport('middleware'),
  }
}

/**
 * True if a route file declares ANY metadata export.
 * Used by the code generator to decide whether to emit `import * as mod`
 * (for metadata access) alongside the lazy() component import.
 */
export function hasAnyMetaExport(exports: RouteFileExports | undefined): boolean {
  if (!exports) return true // unknown — assume yes for back-compat safety
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
  // NOTE: When `files` is `string[]` (back-compat caller path), no per-file
  // export info is known, so the generator falls back to `_pick(mod, "key")`
  // for metadata access (avoiding IMPORT_IS_UNDEFINED warnings) and uses
  // a single static `import * as mod` for everything.
  //
  // When the caller pre-detects exports via `parseFileRoutesWithExports`
  // and passes them through (or uses the async `scanRouteFiles` pipeline),
  // each FileRoute carries `.exports` and the generator emits the optimal
  // shape:
  //   • `lazy(() => import(...))` for the component (code splitting!)
  //   • `import * as mod` ONLY when metadata exports are detected
  //   • Direct `mod.loader` access (no _pick) since we know it exists
  //   • No imports at all for routes that only export `default` other
  //     than the lazy() component import
  return generateRouteModuleFromRoutes(parseFileRoutes(files), routesDir, options)
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

  // Track whether we need _pick at all (only for back-compat path with
  // unknown exports). If every route knows its exports, _pick is unused
  // and we skip emitting the helper.
  let needsPickHelper = false
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
    const exp = page.exports
    const props: string[] = [`${indent}  path: ${JSON.stringify(page.urlPath)}`]

    if (useStaticOnly) {
      // SSG / static mode: bundle everything synchronously, single import.
      if (exp === undefined) {
        // Unknown exports — emit the safe pessimistic shape with _pick
        const mod = nextModuleImport(page.filePath)
        needsPickHelper = true
        props.push(`${indent}  component: ${mod}.default`)
        props.push(`${indent}  loader: _pick(${mod}, "loader")`)
        props.push(`${indent}  beforeEnter: _pick(${mod}, "guard")`)
        props.push(
          `${indent}  meta: { ..._pick(${mod}, "meta"), renderMode: _pick(${mod}, "renderMode") }`,
        )
        if (errorName) {
          props.push(`${indent}  errorComponent: _pick(${mod}, "error") || ${errorName}`)
        }
      } else {
        // Known exports — emit only what exists, direct access
        if (hasAnyMetaExport(exp)) {
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
          // No metadata at all — single static default import
          const comp = nextImport(page.filePath, 'default')
          props.push(`${indent}  component: ${comp}`)
          if (errorName) props.push(`${indent}  errorComponent: ${errorName}`)
        }
      }
    } else {
      // SSR/SPA mode: use lazy() for the component (code splitting).
      // Only add a static `import * as` if metadata exports exist.
      if (exp === undefined) {
        // Unknown exports — pessimistic shape: dual import (one warning)
        // OR static-only with _pick. We choose static-only with _pick here
        // because Rolldown's INEFFECTIVE_DYNAMIC_IMPORT warning is louder
        // than losing per-route code splitting for back-compat callers.
        const mod = nextModuleImport(page.filePath)
        needsPickHelper = true
        props.push(`${indent}  component: ${mod}.default`)
        props.push(`${indent}  loader: _pick(${mod}, "loader")`)
        props.push(`${indent}  beforeEnter: _pick(${mod}, "guard")`)
        props.push(
          `${indent}  meta: { ..._pick(${mod}, "meta"), renderMode: _pick(${mod}, "renderMode") }`,
        )
        if (errorName) {
          props.push(`${indent}  errorComponent: _pick(${mod}, "error") || ${errorName}`)
        }
      } else if (hasAnyMetaExport(exp)) {
        // Has metadata — needs both static module (for metadata) AND lazy
        // for the component. This produces the dual-import collision, so
        // we fall back to static-only for this route. The metadata access
        // is critical (loader runs server-side); the component will still
        // be tree-shaken into the appropriate chunk by Rolldown's chunking.
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
        // No metadata — pure lazy() for code splitting, no metadata import.
        // This is the optimal path: single dynamic import per route.
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
    const exp = layout.exports

    // Decide between two import shapes:
    //   • Layout HAS metadata exports → single `import * as mod` for both
    //     the layout component (mod.layout) AND metadata. One import.
    //   • Layout has NO metadata → just `import { layout as _N }`. One import.
    //   • Back-compat (unknown exports) → `import { layout as _N }` +
    //     `import * as mod` for _pick metadata. Two imports of same file
    //     (both static, no dynamic-vs-static collision).
    let layoutComp: string
    let layoutMod: string | undefined

    if (exp !== undefined && hasAnyMetaExport(exp)) {
      // Single namespace import covers both component and metadata.
      layoutMod = nextModuleImport(layout.filePath)
      layoutComp = `${layoutMod}.layout`
    } else {
      // Either no metadata at all, or unknown exports. Either way we need
      // the named `layout` import for the component.
      layoutComp = nextImport(layout.filePath, 'layout')
    }

    const props: string[] = [
      `${indent}path: ${JSON.stringify(layout.urlPath)}`,
      `${indent}component: ${layoutComp}`,
    ]

    if (exp === undefined) {
      // Back-compat: pessimistic with _pick
      const mod = nextModuleImport(layout.filePath)
      needsPickHelper = true
      props.push(`${indent}loader: _pick(${mod}, "loader")`)
      props.push(`${indent}beforeEnter: _pick(${mod}, "guard")`)
      props.push(
        `${indent}meta: { ..._pick(${mod}, "meta"), renderMode: _pick(${mod}, "renderMode") }`,
      )
    } else if (layoutMod !== undefined) {
      // Known metadata — direct access via the same namespace import
      if (exp.hasLoader) props.push(`${indent}loader: ${layoutMod}.loader`)
      if (exp.hasGuard) props.push(`${indent}beforeEnter: ${layoutMod}.guard`)
      if (exp.hasMeta || exp.hasRenderMode) {
        const metaParts: string[] = []
        if (exp.hasMeta) metaParts.push(`...${layoutMod}.meta`)
        if (exp.hasRenderMode) metaParts.push(`renderMode: ${layoutMod}.renderMode`)
        props.push(`${indent}meta: { ${metaParts.join(', ')} }`)
      }
    }
    // If layout has no metadata exports, we don't emit any metadata
    // props at all — the `clean()` helper drops undefined props anyway.

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

  if (needsPickHelper) {
    lines.push(
      // Read optional module exports via bracket access. Hides them from
      // Rolldown's static export analysis so it doesn't warn about routes
      // that don't export `loader`, `guard`, `meta`, etc.
      `function _pick(mod, key) { return mod[key] }`,
      '',
    )
  }

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
  const { join, relative } = await import('node:path')

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
  const { join } = await import('node:path')

  const files = await scanRouteFiles(routesDir)
  const exportsMap = new Map<string, RouteFileExports>()

  await Promise.all(
    files.map(async (filePath) => {
      try {
        const source = await readFile(join(routesDir, filePath), 'utf-8')
        exportsMap.set(filePath, detectRouteExports(source))
      } catch {
        // If a file can't be read, leave its exports unset — the generator
        // will fall back to the pessimistic _pick path for that route.
      }
    }),
  )

  return parseFileRoutes(files, defaultMode, exportsMap)
}
