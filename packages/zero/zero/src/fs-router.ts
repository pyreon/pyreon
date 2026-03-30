import type { FileRoute, RenderMode } from './types'

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
//   _layout     → layout wrapper (not a route itself)
//   _error      → error component
//   _loading    → loading component
//   (group)     → route group (directory ignored in URL)

const ROUTE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js']

/**
 * Parse a set of file paths (relative to routes dir) into FileRoute objects.
 *
 * @param files Array of file paths like ["index.tsx", "users/[id].tsx"]
 * @param defaultMode Default rendering mode from config
 */
export function parseFileRoutes(files: string[], defaultMode: RenderMode = 'ssr'): FileRoute[] {
  return files
    .filter((f) => ROUTE_EXTENSIONS.some((ext) => f.endsWith(ext)))
    .map((filePath) => parseFilePath(filePath, defaultMode))
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
    if (seg === '_layout' || seg === '_error' || seg === '_loading') continue

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
export function generateRouteModule(files: string[], routesDir: string): string {
  const routes = parseFileRoutes(files)
  const tree = buildRouteTree(routes)
  const imports: string[] = []
  let importCounter = 0

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

  function nextLazy(filePath: string, loadingName?: string, errorName?: string): string {
    const name = `_${importCounter++}`
    const fullPath = `${routesDir}/${filePath}`
    const opts: string[] = []
    if (loadingName) opts.push(`loading: ${loadingName}`)
    if (errorName) opts.push(`error: ${errorName}`)
    const optsStr = opts.length > 0 ? `, { ${opts.join(', ')} }` : ''
    imports.push(`const ${name} = lazy(() => import("${fullPath}")${optsStr})`)
    return name
  }

  function nextModuleImport(filePath: string): string {
    const name = `_m${importCounter++}`
    const fullPath = `${routesDir}/${filePath}`
    imports.push(`import * as ${name} from "${fullPath}"`)
    return name
  }

  function generatePageRoute(
    page: FileRoute,
    indent: string,
    loadingName: string | undefined,
    errorName: string | undefined,
  ): string {
    const mod = nextModuleImport(page.filePath)
    const comp = nextLazy(page.filePath, loadingName, errorName)

    const props: string[] = [
      `${indent}  path: ${JSON.stringify(page.urlPath)}`,
      `${indent}  component: ${comp}`,
      `${indent}  loader: ${mod}.loader`,
      `${indent}  beforeEnter: ${mod}.guard`,
      `${indent}  meta: { ...${mod}.meta, renderMode: ${mod}.renderMode }`,
    ]

    if (errorName) {
      props.push(`${indent}  errorComponent: ${mod}.error || ${errorName}`)
    } else {
      props.push(`${indent}  errorComponent: ${mod}.error`)
    }

    return `${indent}{\n${props.join(',\n')}\n${indent}}`
  }

  function wrapWithLayout(
    node: RouteNode,
    children: string[],
    indent: string,
    errorName: string | undefined,
  ): string {
    const layout = node.layout as FileRoute
    const layoutMod = nextModuleImport(layout.filePath)
    const layoutComp = nextImport(layout.filePath, 'layout')

    const props: string[] = [
      `${indent}path: ${JSON.stringify(layout.urlPath)}`,
      `${indent}component: ${layoutComp}`,
      `${indent}loader: ${layoutMod}.loader`,
      `${indent}beforeEnter: ${layoutMod}.guard`,
      `${indent}meta: { ...${layoutMod}.meta, renderMode: ${layoutMod}.renderMode }`,
    ]
    if (errorName) {
      props.push(`${indent}errorComponent: ${errorName}`)
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

    const childRouteDefs: string[] = []
    for (const [, childNode] of node.children) {
      childRouteDefs.push(...generateNode(childNode, depth + 1))
    }

    const pageRouteDefs = node.pages.map((page) =>
      generatePageRoute(page, indent, loadingName, errorName),
    )

    const allChildren = [...pageRouteDefs, ...childRouteDefs]

    if (node.layout) {
      return [wrapWithLayout(node, allChildren, indent, errorName)]
    }
    return allChildren
  }

  const routeDefs = generateNode(tree, 0)

  return [
    `import { lazy } from "@pyreon/router"`,
    '',
    ...imports,
    '',
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
  ].join('\n')
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
    if (route.isLayout || route.isError || route.isLoading) continue
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
