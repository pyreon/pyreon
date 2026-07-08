/**
 * Project scanner — extracts route, component, and island information from source files.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'

export interface RouteInfo {
  path: string
  name?: string | undefined
  component?: string | undefined
  hasLoader: boolean
  hasGuard: boolean
  params: string[]
  /**
   * True when this is a file-based API route — a `.ts`/`.js` file under an
   * `api/` segment (or a `.ts`/`.js` route file that exports HTTP method
   * handlers instead of a default component). Absent for page routes.
   */
  isApi?: boolean | undefined
}

export interface ComponentInfo {
  name: string
  file: string
  hasSignals: boolean
  signalNames: string[]
  props: string[]
}

export interface IslandInfo {
  name: string
  file: string
  hydrate: string
}

export interface ProjectContext {
  framework: 'pyreon'
  version: string
  generatedAt: string
  routes: RouteInfo[]
  components: ComponentInfo[]
  islands: IslandInfo[]
}

export function generateContext(cwd: string): ProjectContext {
  const files = collectSourceFiles(cwd)
  const version = readVersion(cwd)

  return {
    framework: 'pyreon',
    version,
    generatedAt: new Date().toISOString(),
    routes: extractRoutes(files, cwd),
    components: extractComponents(files, cwd),
    islands: extractIslands(files, cwd),
  }
}

function collectSourceFiles(cwd: string): string[] {
  const results: string[] = []
  const extensions = new Set(['.tsx', '.jsx', '.ts', '.js'])
  const ignoreDirs = new Set(['node_modules', 'dist', 'lib', '.pyreon', '.git', 'build'])

  function walk(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.isDirectory()) continue
      if (ignoreDirs.has(entry.name) && entry.isDirectory()) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
        results.push(fullPath)
      }
    }
  }

  walk(cwd)
  return results
}

/**
 * Extract every route the project declares. Two sources, in priority order:
 *
 *  1. **File-based routes** (`@pyreon/zero`) — the dominant modern shape. Route
 *     files live under `src/routes/` (or `app/routes/` / `routes/`) and the URL
 *     is derived from the file path via the zero fs-router convention. This is
 *     replicated here (NOT imported — `@pyreon/compiler` is a lower layer than
 *     `@pyreon/zero`), mirroring `filePathToUrlPath` / `isApiRoute` /
 *     `apiFilePathToPattern` in `packages/zero/zero/src/{fs-router,api-routes}.ts`.
 *  2. **Manual route arrays** — `createRouter([...])` / `const routes = [...]`
 *     with `path:` keys. Kept for non-zero apps that wire the router by hand.
 *
 * When both exist, file-based routes are the zero truth: a manual array route
 * is added only if its URL isn't already covered by a file-based route.
 */
function extractRoutes(files: string[], cwd: string): RouteInfo[] {
  const routes = extractFileRoutes(cwd)
  const seen = new Set(routes.map((r) => r.path))
  for (const manual of extractManualRoutes(files)) {
    if (seen.has(manual.path)) continue
    seen.add(manual.path)
    routes.push(manual)
  }
  return routes
}

function extractManualRoutes(files: string[]): RouteInfo[] {
  const routes: RouteInfo[] = []

  for (const file of files) {
    let code: string
    try {
      code = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }

    const routeArrayRe =
      /(?:createRouter\s*\(\s*\[|(?:const|let)\s+routes\s*(?::\s*RouteRecord\[\])?\s*=\s*\[)([\s\S]*?)\]/g
    let match: RegExpExecArray | null
    for (match = routeArrayRe.exec(code); match; match = routeArrayRe.exec(code)) {
      const block = match[1] ?? ''
      const routeObjRe = /path\s*:\s*["']([^"']+)["']/g
      let routeMatch: RegExpExecArray | null
      for (routeMatch = routeObjRe.exec(block); routeMatch; routeMatch = routeObjRe.exec(block)) {
        const routePath = routeMatch[1] ?? ''
        const surroundingStart = Math.max(0, routeMatch.index - 50)
        const surroundingEnd = Math.min(block.length, routeMatch.index + 200)
        const surrounding = block.slice(surroundingStart, surroundingEnd)

        routes.push({
          path: routePath,
          name: surrounding.match(/name\s*:\s*["']([^"']+)["']/)?.[1],
          hasLoader: /loader\s*:/.test(surrounding),
          hasGuard: /beforeEnter\s*:|beforeLeave\s*:/.test(surrounding),
          params: extractParams(routePath),
        })
      }
    }
  }

  return routes
}

/** Route-file extensions, in the same precedence order the zero fs-router uses. */
const ROUTE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js']

/**
 * Special (non-navigable) file names. These configure the route tree
 * (`_layout` wraps children; `_error`/`_loading`/`_404` are fallbacks) but
 * are not themselves URL routes — the context generator emits only navigable
 * page/api routes, so all of these are skipped.
 */
const SPECIAL_ROUTE_FILES = new Set(['_layout', '_error', '_loading', '_404', '_not-found'])

/** Locate the fs-router routes directory, checking each convention in order. */
function findRoutesDir(cwd: string): string | undefined {
  for (const candidate of ['src/routes', 'app/routes', 'routes']) {
    const full = path.join(cwd, candidate)
    try {
      if (fs.statSync(full).isDirectory()) return full
    } catch {
      // not present — try the next candidate
    }
  }
  return undefined
}

/** Enumerate route files under `routesDir`, returned as forward-slash paths relative to it. */
function enumerateRouteFiles(routesDir: string): string[] {
  const out: string[] = []
  const exts = new Set(ROUTE_EXTENSIONS)

  function walk(dir: string, prefix: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        walk(full, rel)
      } else if (entry.isFile() && exts.has(path.extname(entry.name))) {
        // Skip test/spec/story fixtures + serverLoader (`*.server.ts`) siblings —
        // none are navigable routes.
        if (/\.(test|spec|stories)\.(tsx?|jsx?)$/.test(entry.name)) continue
        if (/\.server\.(tsx?|jsx?)$/.test(entry.name)) continue
        out.push(rel)
      }
    }
  }

  walk(routesDir, '')
  return out
}

function extractFileRoutes(cwd: string): RouteInfo[] {
  const routesDir = findRoutesDir(cwd)
  if (!routesDir) return []

  const routes: RouteInfo[] = []
  for (const rel of enumerateRouteFiles(routesDir)) {
    const noExt = stripRouteExt(rel)
    const fileName = noExt.split('/').pop() ?? ''
    if (SPECIAL_ROUTE_FILES.has(fileName)) continue

    let source = ''
    try {
      source = fs.readFileSync(path.join(routesDir, rel), 'utf-8')
    } catch {
      // unreadable — still emit the path (empty source ⇒ no loader/guard flags)
    }

    const api = isApiRouteFile(rel, source)
    const urlPath = api ? apiFilePathToUrlPath(rel) : fileRouteToUrlPath(noExt)

    routes.push({
      path: urlPath,
      hasLoader: detectFileExport(source, 'loader') || detectFileExport(source, 'serverLoader'),
      hasGuard: detectFileExport(source, 'guard') || detectFileExport(source, 'middleware'),
      params: extractParams(urlPath),
      ...(api ? { isApi: true } : {}),
    })
  }

  // Stable, human-friendly ordering for the generated context.json.
  routes.sort((a, b) => a.path.localeCompare(b.path))
  return routes
}

/** Strip the first matching route extension from a path. */
function stripRouteExt(filePath: string): string {
  for (const ext of ROUTE_EXTENSIONS) {
    if (filePath.endsWith(ext)) return filePath.slice(0, -ext.length)
  }
  return filePath
}

/**
 * Convert an extension-stripped file-route path to its URL pattern. Mirrors
 * `filePathToUrlPath` in `packages/zero/zero/src/fs-router.ts`:
 *   `index` → `/` · `[param]` → `:param` · `[...param]` → `:param*` ·
 *   `(group)` segments are URL-invisible · special files are skipped upstream.
 */
function fileRouteToUrlPath(routeNoExt: string): string {
  const urlSegments: string[] = []
  for (const seg of routeNoExt.split('/')) {
    if (seg.startsWith('(') && seg.endsWith(')')) continue // route group — URL-invisible
    if (SPECIAL_ROUTE_FILES.has(seg)) continue
    if (seg === 'index') continue

    const catchAll = seg.match(/^\[\.\.\.(\w+)\]$/)
    if (catchAll) {
      urlSegments.push(`:${catchAll[1]}*`)
      continue
    }
    const dynamic = seg.match(/^\[(\w+)\]$/)
    if (dynamic) {
      urlSegments.push(`:${dynamic[1]}`)
      continue
    }
    urlSegments.push(seg)
  }
  // Empty segment list (root `index`) already yields "/".
  return `/${urlSegments.join('/')}`
}

/**
 * Convert an API route file path to its URL pattern. Mirrors
 * `apiFilePathToPattern` in `packages/zero/zero/src/api-routes.ts` — the
 * `api/` prefix is preserved (it IS part of the URL), `index` collapses,
 * and `[param]` / `[...param]` become `:param` / `:param*`.
 */
function apiFilePathToUrlPath(rel: string): string {
  const noExt = stripRouteExt(rel)
  const urlSegments: string[] = []
  for (const seg of noExt.split('/')) {
    if (seg === 'index') continue
    const catchAll = seg.match(/^\[\.\.\.(\w+)\]$/)
    if (catchAll) {
      urlSegments.push(`:${catchAll[1]}*`)
      continue
    }
    const dynamic = seg.match(/^\[(\w+)\]$/)
    if (dynamic) {
      urlSegments.push(`:${dynamic[1]}`)
      continue
    }
    urlSegments.push(seg)
  }
  return `/${urlSegments.join('/')}`
}

/**
 * True for a file-based API route. Mirrors `isApiRoute` (path under `api/`,
 * `.ts`/`.js` only) and additionally accepts a `.ts`/`.js` route file that
 * exports HTTP method handlers with no default component (method-handler shape).
 */
function isApiRouteFile(rel: string, source: string): boolean {
  const normalized = rel.replace(/\\/g, '/')
  const isTsJs =
    (normalized.endsWith('.ts') || normalized.endsWith('.js')) &&
    !normalized.endsWith('.tsx') &&
    !normalized.endsWith('.jsx')
  if (!isTsJs) return false
  if (normalized.startsWith('api/') || normalized.includes('/api/')) return true

  const hasMethodHandler =
    /export\s+(?:async\s+)?(?:const|let|var|function)\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/.test(
      source,
    ) ||
    /export\s*\{[^}]*\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b[^}]*\}/.test(source)
  const hasDefault = /export\s+default\b/.test(source)
  return hasMethodHandler && !hasDefault
}

/** Detect a top-level `export const|let|var|function NAME` or `export { NAME }`. */
function detectFileExport(source: string, name: string): boolean {
  const decl = new RegExp(`export\\s+(?:async\\s+)?(?:const|let|var|function)\\s+${name}\\b`)
  if (decl.test(source)) return true
  const list = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`)
  return list.test(source)
}

function extractComponents(files: string[], cwd: string): ComponentInfo[] {
  const components: ComponentInfo[] = []

  for (const file of files) {
    let code: string
    try {
      code = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }

    const componentRe =
      /(?:export\s+)?(?:const|function)\s+([A-Z]\w*)\s*(?::\s*ComponentFn<[^>]+>\s*)?=?\s*\(?(?:\s*\{?\s*([^)]*?)\s*\}?\s*)?\)?\s*(?:=>|{)/g
    let match: RegExpExecArray | null

    for (match = componentRe.exec(code); match; match = componentRe.exec(code)) {
      const name = match[1] ?? 'Unknown'
      const propsStr = match[2] ?? ''
      const props = propsStr
        .split(/[,;]/)
        .map((p) => p.trim().replace(/[{}]/g, '').trim().split(':')[0]?.split('=')[0]?.trim() ?? '')
        .filter((p) => p && p !== 'props')

      const bodyStart = match.index + match[0].length
      const body = code.slice(bodyStart, Math.min(code.length, bodyStart + 2000))
      const signalNames: string[] = []
      const signalRe = /(?:const|let)\s+(\w+)\s*=\s*signal\s*[<(]/g
      let sigMatch: RegExpExecArray | null
      for (sigMatch = signalRe.exec(body); sigMatch; sigMatch = signalRe.exec(body)) {
        if (sigMatch[1]) signalNames.push(sigMatch[1])
      }

      components.push({
        name,
        file: path.relative(cwd, file),
        hasSignals: signalNames.length > 0,
        signalNames,
        props,
      })
    }
  }

  return components
}

/**
 * Extract `island()` declarations via the TS AST. Handles BOTH shapes:
 *   • explicit name — `island(() => import('./x'), { name: 'X', hydrate: 'load' })`
 *   • auto-named    — `const Widget = island(() => import('./w'), { hydrate: 'visible' })`
 *     (zero auto-names const-bound islands off the binding identifier — the #1
 *     modern shape the old `name:`-requiring regex missed entirely)
 *
 * The name is resolved in priority order: explicit `name:` option → enclosing
 * `const/let/var <Name> = island(...)` binding → file basename fallback (for a
 * bindingless nameless call). The loader-argument shape is NOT constrained, so
 * `island(loader, opts)` with a hoisted loader is captured too.
 */
function extractIslands(files: string[], cwd: string): IslandInfo[] {
  const islands: IslandInfo[] = []

  for (const file of files) {
    let code: string
    try {
      code = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    // Cheap pre-filter so we only pay for AST parsing on files that could
    // contain an island() call.
    if (!code.includes('island')) continue

    let sf: ts.SourceFile
    try {
      sf = ts.createSourceFile(file, code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
    } catch {
      continue
    }

    const relFile = path.relative(cwd, file)

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'island' &&
        node.arguments.length >= 1
      ) {
        let nameVal: string | undefined
        let hydrateVal: string | undefined

        const optsArg = node.arguments[1]
        if (optsArg && ts.isObjectLiteralExpression(optsArg)) {
          for (const prop of optsArg.properties) {
            if (!ts.isPropertyAssignment(prop)) continue
            const key = ts.isIdentifier(prop.name)
              ? prop.name.text
              : ts.isStringLiteral(prop.name)
                ? prop.name.text
                : ''
            if (key === 'name') nameVal = stringLiteralValue(prop.initializer)
            else if (key === 'hydrate') hydrateVal = stringLiteralValue(prop.initializer)
          }
        }

        // Fall back to the enclosing const-binding identifier (zero's
        // auto-naming source), then to the file basename.
        if (!nameVal) nameVal = bindingNameOf(node)
        if (!nameVal) nameVal = path.basename(relFile).replace(/\.(tsx?|jsx?)$/, '') || 'island'

        islands.push({ name: nameVal, file: relFile, hydrate: hydrateVal ?? 'load' })
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }

  return islands
}

/** The identifier of an enclosing `const/let/var <Name> = <call>` binding, if any. */
function bindingNameOf(call: ts.CallExpression): string | undefined {
  const parent = call.parent
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text
  }
  return undefined
}

/** Read a string-literal / no-substitution-template value, else undefined. */
function stringLiteralValue(node: ts.Expression | undefined): string | undefined {
  if (!node) return undefined
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return undefined
}

function extractParams(routePath: string): string[] {
  const params: string[] = []
  const paramRe = /:(\w+)\??/g
  let match: RegExpExecArray | null
  for (match = paramRe.exec(routePath); match; match = paramRe.exec(routePath)) {
    if (match[1]) params.push(match[1])
  }
  return params
}

function readVersion(cwd: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'))
    const deps: Record<string, unknown> = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const [name, ver] of Object.entries(deps)) {
      if (name.startsWith('@pyreon/') && typeof ver === 'string') return ver.replace(/^[\^~]/, '')
    }
    return (pkg.version as string) || 'unknown'
  } catch {
    return 'unknown'
  }
}
