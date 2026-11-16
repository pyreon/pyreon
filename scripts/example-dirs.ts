/**
 * The one place that knows where examples live.
 *
 * `examples/` holds example apps at the top level and inside group folders
 * (`examples/compat/<framework>`, `examples/fixtures/<name>`,
 * `examples/fixtures/cpa/<template>`). An example is a directory with a
 * `package.json`; a group folder has none. Every script, config and test that
 * finds an example goes through here, so a layout change is one edit.
 *
 * Lookups FAIL on a missing example. Scripts used to build a path with
 * `join('examples', name)` and then `continue` when it did not exist, so a
 * rename silently turned their check off. `exampleDir` throws instead and
 * names the fix.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * The repository root: the nearest directory, from the working directory up,
 * that holds this file. Found by walking rather than from `import.meta`,
 * because Playwright loads its configs (which import this module) as CommonJS,
 * where `import.meta` is a syntax error.
 */
function findRepoRoot(start: string): string {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, 'scripts', 'example-dirs.ts')) && existsSync(join(dir, 'examples'))) return dir
    const parent = dirname(dir)
    // Not inside the repository (a script copied into a temp fixture): use
    // the start directory; a lookup there then fails with "does not exist".
    if (parent === dir) return resolve(start)
    dir = parent
  }
}

export const REPO_ROOT = findRepoRoot(process.cwd())

/** Folders under `examples/` that group examples; they are never examples themselves. */
export const EXAMPLE_GROUPS = ['compat', 'fixtures', 'fixtures/cpa'] as const

/** Root `package.json` workspace globs that cover every example, one per nesting level. */
export const EXAMPLE_WORKSPACE_GLOBS = ['examples/*', ...EXAMPLE_GROUPS.map((g) => `examples/${g}/*`)] as const

/** Never descended into: installs and build output. */
const SKIP = new Set(['node_modules', 'dist', 'lib', '.zero', '.turbo', 'build', '.output', '.vercel'])

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * Every example directory, as a path relative to `examples/` (`app-showcase`,
 * `compat/react`, `fixtures/cpa/app`), sorted. A directory with a
 * `package.json` is an example and is not descended into; any other directory
 * is searched up to three levels down. Throws when nothing is found (an empty
 * scan is a broken scan, not a pass), unless `allowNone` is set for package
 * discovery that also runs on synthetic test trees without examples.
 */
export function listExampleDirs(root: string = REPO_ROOT, options: { allowNone?: boolean } = {}): string[] {
  const examples = join(root, 'examples')
  const out: string[] = []
  const walk = (rel: string, depth: number): void => {
    const abs = rel ? join(examples, rel) : examples
    for (const name of readdirSync(abs).sort()) {
      if (SKIP.has(name) || name.startsWith('.')) continue
      const childRel = rel ? `${rel}/${name}` : name
      const childAbs = join(examples, childRel)
      if (!isDir(childAbs)) continue
      if (existsSync(join(childAbs, 'package.json'))) out.push(childRel)
      else if (depth < 3) walk(childRel, depth + 1)
    }
  }
  if (!isDir(examples)) {
    if (options.allowNone) return []
    throw new Error(`[Pyreon] example-dirs: ${examples} does not exist.`)
  }
  walk('', 0)
  if (out.length === 0 && !options.allowNone) {
    throw new Error(`[Pyreon] example-dirs: found no example under ${examples}; the scan is wrong.`)
  }
  return out.sort()
}

/**
 * The absolute directory of one example, given its path under `examples/`
 * (`fixtures/ssr-showcase`, `compat/react`, `hn-clone`). Throws when that
 * directory has no `package.json`, naming the examples that do exist, so a
 * moved or renamed example breaks its consumer loudly.
 */
export function exampleDir(rel: string, root: string = REPO_ROOT): string {
  const clean = rel.replace(/^examples\//, '').replace(/\/+$/, '')
  const abs = join(root, 'examples', clean)
  if (!existsSync(join(abs, 'package.json'))) {
    let known: string[] = []
    try {
      known = listExampleDirs(root)
    } catch {
      // Report the missing example even when the scan itself fails.
    }
    throw new Error(
      `[Pyreon] example-dirs: examples/${clean} is not an example (no package.json there). ` +
        `It was probably moved or renamed: update the reference. Examples: ${known.join(', ')}`,
    )
  }
  return abs
}

/**
 * Resolve an example given either its path under `examples/`
 * (`fixtures/perf-dashboard`) or, for scripts that key results by app name,
 * its directory name (`perf-dashboard`), which must then be unique. Throws on
 * no match or several, so a moved example breaks its consumer loudly.
 */
export function findExample(nameOrPath: string, root: string = REPO_ROOT): { rel: string; dir: string } {
  const clean = nameOrPath.replace(/^examples\//, '').replace(/\/+$/, '')
  if (clean.includes('/')) return { rel: clean, dir: exampleDir(clean, root) }
  const all = listExampleDirs(root)
  const hits = all.filter((rel) => rel === clean || rel.endsWith(`/${clean}`))
  if (hits.length === 1) return { rel: hits[0]!, dir: join(root, 'examples', hits[0]!) }
  throw new Error(
    hits.length === 0
      ? `[Pyreon] example-dirs: no example named "${clean}" under examples/. It was probably moved or renamed: update the reference. Examples: ${all.join(', ')}`
      : `[Pyreon] example-dirs: "${clean}" names several examples (${hits.join(', ')}); pass the path under examples/ instead.`,
  )
}
