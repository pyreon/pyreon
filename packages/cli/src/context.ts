/**
 * pyreon context — generates .pyreon/context.json for AI tool consumption
 *
 * Scans the project to extract:
 *  - Route definitions (paths, params, loaders, guards)
 *  - Component inventory (file, props, signals)
 *  - Island declarations (name, hydration strategy)
 *  - Framework version
 */

import * as fs from "node:fs"
import * as path from "node:path"

export interface ContextOptions {
  cwd: string
  outPath?: string | undefined
}

export interface RouteInfo {
  path: string
  name?: string | undefined
  component?: string | undefined
  hasLoader: boolean
  hasGuard: boolean
  params: string[]
  children?: RouteInfo[] | undefined
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
  framework: "pyreon"
  version: string
  generatedAt: string
  routes: RouteInfo[]
  components: ComponentInfo[]
  islands: IslandInfo[]
}

export async function generateContext(options: ContextOptions): Promise<ProjectContext> {
  const version = readVersion(options.cwd)
  const sourceFiles = collectTsxFiles(options.cwd)

  const routes = extractRoutes(sourceFiles, options.cwd)
  const components = extractComponents(sourceFiles, options.cwd)
  const islands = extractIslands(sourceFiles, options.cwd)

  const context: ProjectContext = {
    framework: "pyreon",
    version,
    generatedAt: new Date().toISOString(),
    routes,
    components,
    islands,
  }

  // Write to .pyreon/context.json
  const outDir = options.outPath ? path.dirname(options.outPath) : path.join(options.cwd, ".pyreon")
  const outFile = options.outPath ?? path.join(outDir, "context.json")

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }
  fs.writeFileSync(outFile, JSON.stringify(context, null, 2), "utf-8")

  // Ensure .pyreon/ is in .gitignore
  ensureGitignore(options.cwd)

  const relOut = path.relative(options.cwd, outFile)
  console.log(
    `  ✓ Generated ${relOut} (${components.length} components, ${routes.length} routes, ${islands.length} islands)`,
  )

  return context
}

// ═══════════════════════════════════════════════════════════════════════════════
// Extractors
// ═══════════════════════════════════════════════════════════════════════════════

function parseRouteFromBlock(block: string, routeMatch: RegExpExecArray): RouteInfo {
  const routePath = routeMatch[1] ?? ""
  const params = extractParams(routePath)

  const surroundingStart = Math.max(0, routeMatch.index - 50)
  const surroundingEnd = Math.min(block.length, routeMatch.index + 200)
  const surrounding = block.slice(surroundingStart, surroundingEnd)

  const hasLoader = /loader\s*:/.test(surrounding)
  const hasGuard = /beforeEnter\s*:|beforeLeave\s*:/.test(surrounding)
  const nameMatch = surrounding.match(/name\s*:\s*["']([^"']+)["']/)

  return {
    path: routePath,
    name: nameMatch?.[1],
    hasLoader,
    hasGuard,
    params,
  }
}

function extractRoutesFromBlock(block: string): RouteInfo[] {
  const routes: RouteInfo[] = []
  const routeObjRe = /path\s*:\s*["']([^"']+)["']/g
  let routeMatch: RegExpExecArray | null
  while (true) {
    routeMatch = routeObjRe.exec(block)
    if (!routeMatch) break
    routes.push(parseRouteFromBlock(block, routeMatch))
  }
  return routes
}

function extractRoutes(files: string[], _cwd: string): RouteInfo[] {
  const routes: RouteInfo[] = []

  for (const file of files) {
    let code: string
    try {
      code = fs.readFileSync(file, "utf-8")
    } catch {
      continue
    }

    const routeArrayRe =
      /(?:createRouter\s*\(\s*\[|(?:const|let)\s+routes\s*(?::\s*RouteRecord\[\])?\s*=\s*\[)([\s\S]*?)\]/g
    let match: RegExpExecArray | null
    while (true) {
      match = routeArrayRe.exec(code)
      if (!match) break
      const block = match[1] ?? ""
      for (const route of extractRoutesFromBlock(block)) {
        routes.push(route)
      }
    }
  }

  return routes
}

function parseProps(propsStr: string): string[] {
  return propsStr
    .split(",")
    .map((p) => p.trim().split(":")[0]?.split("=")[0]?.trim() ?? "")
    .filter((p) => p && p !== "props")
}

function collectSignalNames(body: string): string[] {
  const signalNames: string[] = []
  const signalRe = /(?:const|let)\s+(\w+)\s*=\s*signal\s*[<(]/g
  let sigMatch: RegExpExecArray | null
  while (true) {
    sigMatch = signalRe.exec(body)
    if (!sigMatch) break
    if (sigMatch[1]) signalNames.push(sigMatch[1])
  }
  return signalNames
}

function extractComponentsFromCode(code: string, relFile: string): ComponentInfo[] {
  const components: ComponentInfo[] = []
  const componentRe =
    /(?:export\s+)?(?:const|function)\s+([A-Z]\w*)\s*(?::\s*ComponentFn<[^>]+>\s*)?=?\s*\(?(?:\s*\{?\s*([^)]*?)\s*\}?\s*)?\)?\s*(?:=>|{)/g
  let match: RegExpExecArray | null

  while (true) {
    match = componentRe.exec(code)
    if (!match) break
    const name = match[1] ?? "Unknown"
    const props = parseProps(match[2] ?? "")

    const bodyStart = match.index + match[0].length
    const body = code.slice(bodyStart, Math.min(code.length, bodyStart + 2000))
    const signalNames = collectSignalNames(body)

    components.push({
      name,
      file: relFile,
      hasSignals: signalNames.length > 0,
      signalNames,
      props,
    })
  }

  return components
}

function extractComponents(files: string[], _cwd: string): ComponentInfo[] {
  const components: ComponentInfo[] = []

  for (const file of files) {
    let code: string
    try {
      code = fs.readFileSync(file, "utf-8")
    } catch {
      continue
    }

    const relFile = path.relative(_cwd, file)
    for (const comp of extractComponentsFromCode(code, relFile)) {
      components.push(comp)
    }
  }

  return components
}

function extractIslands(files: string[], cwd: string): IslandInfo[] {
  const islands: IslandInfo[] = []

  for (const file of files) {
    let code: string
    try {
      code = fs.readFileSync(file, "utf-8")
    } catch {
      continue
    }

    const islandRe =
      /island\s*\(\s*\(\)\s*=>\s*import\(.+?\)\s*,\s*\{[^}]*name\s*:\s*["']([^"']+)["'][^}]*?(?:hydrate\s*:\s*["']([^"']+)["'])?[^}]*\}/g
    let match: RegExpExecArray | null
    while (true) {
      match = islandRe.exec(code)
      if (!match) break
      if (match[1]) {
        islands.push({
          name: match[1],
          file: path.relative(cwd, file),
          hydrate: match[2] ?? "load",
        })
      }
    }
  }

  return islands
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function extractParams(routePath: string): string[] {
  const params: string[] = []
  const paramRe = /:(\w+)\??/g
  let match: RegExpExecArray | null
  while (true) {
    match = paramRe.exec(routePath)
    if (!match) break
    if (match[1]) params.push(match[1])
  }
  return params
}

function readVersion(cwd: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf-8"))
    const deps: Record<string, unknown> = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const [name, version] of Object.entries(deps)) {
      if (name.startsWith("@pyreon/") && typeof version === "string") {
        return version.replace(/^[\^~]/, "")
      }
    }
    return (pkg.version as string) || "unknown"
  } catch {
    return "unknown"
  }
}

const tsxExtensions = new Set([".tsx", ".jsx", ".ts", ".js"])
const tsxIgnoreDirs = new Set(["node_modules", "dist", "lib", ".pyreon", ".git", "build"])

function shouldSkipEntry(entry: fs.Dirent): boolean {
  if (!entry.isDirectory()) return false
  return entry.name.startsWith(".") || tsxIgnoreDirs.has(entry.name)
}

function walkTsxFiles(dir: string, results: string[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (shouldSkipEntry(entry)) continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTsxFiles(fullPath, results)
    } else if (entry.isFile() && tsxExtensions.has(path.extname(entry.name))) {
      results.push(fullPath)
    }
  }
}

function collectTsxFiles(cwd: string): string[] {
  const results: string[] = []
  walkTsxFiles(cwd, results)
  return results
}

function ensureGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, ".gitignore")
  try {
    const content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf-8") : ""

    if (!content.includes(".pyreon/") && !content.includes(".pyreon\n")) {
      const addition = content.endsWith("\n") ? ".pyreon/\n" : "\n.pyreon/\n"
      fs.appendFileSync(gitignorePath, addition)
    }
  } catch {
    // Ignore errors with .gitignore
  }
}
