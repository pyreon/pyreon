/**
 * Universal file-path classifiers for lint rules.
 *
 * What belongs here:
 *   - Conventions that exist in every project the linter runs on
 *     (test files, example directories — the `*.test.*` convention
 *     is not Pyreon-specific).
 *
 * What does NOT belong here:
 *   - Monorepo-specific paths like `packages/core/runtime-dom/` —
 *     those are implementation knowledge of one particular codebase
 *     and have no meaning in a user's app. Exemptions for such paths
 *     belong in the consuming project's lint config via the
 *     `exemptPaths: string[]` rule option — see `utils/exempt-paths.ts`
 *     and the Pyreon monorepo's `.pyreonlintrc.json` at repo root for
 *     reference.
 */

/**
 * Matches files that are tests by convention. Universal — the
 * `*.test.*` / `*.spec.*` / `/tests/` / `/__tests__/` conventions
 * exist in every codebase this linter runs on, not just Pyreon.
 */
export function isTestFile(filePath: string): boolean {
  return (
    filePath.includes('/tests/') ||
    filePath.includes('/test/') ||
    filePath.includes('/__tests__/') ||
    filePath.includes('.test.') ||
    filePath.includes('.spec.')
  )
}

/**
 * Matches files that run on the SERVER by convention.
 *
 * Deliberately NOT a substring test. Two rules independently shipped
 * `filePath.includes('server')`, and the string `observer` contains `server` —
 * so `use-intersection-observer.ts`, a client-only hook, was classified as a
 * server file by both. Reproduced directly against `lintFile`: it fired.
 *
 * A role a rule gets wrong does not surface as an error. It silently applies
 * the wrong rule set, which is the same failure mode as a stale glob in an
 * `overrides` block — the thing a framework-aware linter exists to avoid.
 *
 * Matches, by word boundary rather than substring:
 *   - a `server/` PATH SEGMENT — `src/server/handler.ts`
 *   - a filename whose stem is or ends in `server`, delimited by `.` or `-` —
 *     `server.ts`, `foo.server.ts`, `entry-server.tsx`
 *
 * Does NOT match `observer.ts`, `use-resize-observer.ts`, `webserver-utils.ts`.
 */
export function isServerFile(filePath: string): boolean {
  const p = filePath.replace(/\\/g, '/')
  const base = p.slice(p.lastIndexOf('/') + 1)
  if (/(^|[.-])server\.[cm]?[jt]sx?$/.test(base)) return true
  return p.split('/').includes('server')
}

/** Where a file runs. `shared` is the safe default: it must satisfy BOTH sides. */
export type FileRole = 'server' | 'client' | 'shared' | 'build' | 'test'

const NODE_BUILTIN = /from\s+['"]node:|require\(\s*['"]node:/
const SERVER_ENTRY = /from\s+['"]@pyreon\/(?:zero\/server|server)['"]/
const CLIENT_ENTRY = /\bisland\s*\(|from\s+['"]@pyreon\/server\/client['"]/
const BUILD_FILE = /(^|\/)(vite|vitest|playwright|rollup|esbuild|tsup)\.[a-z.]*config\.[cm]?[jt]s$|(^|\/)(scripts|bench|benchmarks|e2e)\//

/**
 * True when the file is an fs-router API route — `routes/api/**.ts`.
 *
 * Mirrors `@pyreon/compiler`'s `isApiRoute`, which the fs-router and the
 * api-route registry share so they cannot disagree. Reimplemented here rather
 * than imported because the linter must not take a dependency on the compiler
 * for a path test — but the SHAPE is deliberately identical: a `.ts`/`.js`
 * file under a top-level `api/` inside a routes dir. A `.tsx` under `api/` is
 * a page route and still renders, so it is NOT server-only.
 */
export function isApiRouteFile(filePath: string): boolean {
  const p = filePath.replace(/\\/g, '/')
  const m = /(?:^|\/)routes\/(.+)$/.exec(p)
  if (!m?.[1]) return false
  const rel = m[1]
  return rel.startsWith('api/') && /\.[cm]?[jt]s$/.test(rel) && !/\.[jt]sx$/.test(rel)
}

/** True when the file is a client-only entry or declares an island. */
export function isClientFile(filePath: string, source = ''): boolean {
  const p = filePath.replace(/\\/g, '/')
  if (/(^|[.-])client\.[cm]?[jt]sx?$/.test(p.slice(p.lastIndexOf('/') + 1))) return true
  if (p.includes('/entry-client')) return true
  return CLIENT_ENTRY.test(source)
}

/**
 * Resolve where a file runs, strongest signal first.
 *
 * Ordered by how much the signal PROVES, not by convenience: a `node:` import
 * cannot run in a browser, so it outranks any filename convention. Conventions
 * outrank the default. The default is `shared`, which is the strict answer —
 * a file that might run in both places has to satisfy both rule sets, and
 * guessing either side would silently disable the other's rules.
 */
export function resolveFileRole(filePath: string, source = ''): FileRole {
  if (isTestFile(filePath)) return 'test'
  // Proof — the module graph settles it.
  if (NODE_BUILTIN.test(source) || SERVER_ENTRY.test(source)) return 'server'
  if (isApiRouteFile(filePath)) return 'server'
  if (isClientFile(filePath, source)) return 'client'
  // Convention.
  if (isServerFile(filePath)) return 'server'
  if (BUILD_FILE.test(filePath.replace(/\\/g, '/'))) return 'build'
  return 'shared'
}

/**
 * Does a rule declaring `appliesTo` run on this file?
 *
 * Plain membership — a rule that wants isomorphic files must SAY `'shared'`.
 *
 * The first cut auto-expanded `shared` to match `server` or `client`, on the
 * reasoning that an isomorphic file runs in both and should satisfy both. That
 * is true for a CONSTRAINT (`no-locale-dependent-format` genuinely applies to
 * any file that renders on both sides) and false for a ROLE (`no-sync-fs-in-
 * request-path` is about a request path, and a shared utility is not one).
 *
 * Measured on this repo, the auto-expansion produced 469 findings from the
 * floating-promise rule and 149 from the sync-fs rule — almost all in build
 * scripts and compiler internals, where both constructs are correct. Explicit
 * listing took them to a reviewable handful. A rule that wants both says both.
 */
export function roleMatches(appliesTo: readonly FileRole[], role: FileRole): boolean {
  return appliesTo.includes(role)
}
