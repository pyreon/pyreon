/**
 * M3.5 — Tests for the 3 SSG lint rules:
 *   - pyreon/revalidate-not-pure-literal
 *   - pyreon/missing-get-static-paths
 *   - pyreon/invalid-loader-export
 *
 * Each rule has a parallel pair of specs (broken / fixed) to keep
 * bisect-verification fast.
 */
import { getPreset } from '../config/presets'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

function lintRoute(source: string, filePath: string) {
  return lintFile(filePath, source, allRules, getPreset('recommended'))
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

// ─── 1) pyreon/revalidate-not-pure-literal ─────────────────────────────────

describe('pyreon/revalidate-not-pure-literal (M3.5)', () => {
  it('FIRES on `export const revalidate = TTL` (identifier ref) in a route file', () => {
    const source = `
const TTL = 60
export const revalidate = TTL
export default function Page() { return null }
`
    const result = lintRoute(source, 'src/routes/posts/index.tsx')
    expect(diagIds(result)).toContain('pyreon/revalidate-not-pure-literal')
  })

  it('FIRES on `export const revalidate = 30 * 60` (arithmetic)', () => {
    const source = `export const revalidate = 30 * 60
export default function Page() { return null }`
    const result = lintRoute(source, 'src/routes/posts/index.tsx')
    expect(diagIds(result)).toContain('pyreon/revalidate-not-pure-literal')
  })

  it('does NOT fire on `export const revalidate = 60` (literal)', () => {
    const source = `export const revalidate = 60
export default function Page() { return null }`
    const result = lintRoute(source, 'src/routes/posts/index.tsx')
    expect(diagIds(result)).not.toContain('pyreon/revalidate-not-pure-literal')
  })

  it('does NOT fire on `export const revalidate = false`', () => {
    const source = `export const revalidate = false
export default function Page() { return null }`
    const result = lintRoute(source, 'src/routes/posts/index.tsx')
    expect(diagIds(result)).not.toContain('pyreon/revalidate-not-pure-literal')
  })

  it('does NOT fire when there is no revalidate export', () => {
    const source = `export default function Page() { return null }`
    const result = lintRoute(source, 'src/routes/posts/index.tsx')
    expect(diagIds(result)).not.toContain('pyreon/revalidate-not-pure-literal')
  })

  it('does NOT fire outside routes/ (rule is route-scoped)', () => {
    const source = `const TTL = 60
export const revalidate = TTL`
    const result = lintRoute(source, 'src/lib/helpers.ts')
    expect(diagIds(result)).not.toContain('pyreon/revalidate-not-pure-literal')
  })
})

// ─── 2) pyreon/missing-get-static-paths ────────────────────────────────────

describe('pyreon/missing-get-static-paths (M3.5)', () => {
  it('FIRES on [id].tsx without getStaticPaths', () => {
    const source = `export default function Post() { return null }`
    const result = lintRoute(source, 'src/routes/posts/[id].tsx')
    expect(diagIds(result)).toContain('pyreon/missing-get-static-paths')
  })

  it('FIRES on catch-all [...slug].tsx without getStaticPaths', () => {
    const source = `export default function Blog() { return null }`
    const result = lintRoute(source, 'src/routes/blog/[...slug].tsx')
    expect(diagIds(result)).toContain('pyreon/missing-get-static-paths')
  })

  it('does NOT fire on [id].tsx WITH `export const getStaticPaths`', () => {
    const source = `export const getStaticPaths = () => [{ params: { id: '1' } }]
export default function Post() { return null }`
    const result = lintRoute(source, 'src/routes/posts/[id].tsx')
    expect(diagIds(result)).not.toContain('pyreon/missing-get-static-paths')
  })

  it('does NOT fire on [id].tsx WITH `export async function getStaticPaths`', () => {
    const source = `export async function getStaticPaths() { return [{ params: { id: '1' } }] }
export default function Post() { return null }`
    const result = lintRoute(source, 'src/routes/posts/[id].tsx')
    expect(diagIds(result)).not.toContain('pyreon/missing-get-static-paths')
  })

  it('does NOT fire on static routes (no [param] in filename)', () => {
    const source = `export default function About() { return null }`
    const result = lintRoute(source, 'src/routes/about.tsx')
    expect(diagIds(result)).not.toContain('pyreon/missing-get-static-paths')
  })

  it('does NOT fire on _layout / _error / _404 even if name contains brackets', () => {
    const result = lintRoute(`export const layout = () => null`, 'src/routes/_layout.tsx')
    expect(diagIds(result)).not.toContain('pyreon/missing-get-static-paths')
  })

  it('does NOT fire outside routes/', () => {
    const source = `export default function Foo() { return null }`
    const result = lintRoute(source, 'src/components/[fake].tsx')
    expect(diagIds(result)).not.toContain('pyreon/missing-get-static-paths')
  })

  // M3.B follow-up — false-positive class surfaced by cpa-pw-blog's
  // `api/echo/[...path].ts` (real-world API route with bracket
  // filename). API routes are runtime-only by definition; getStaticPaths
  // doesn't apply.
  it('does NOT fire on API routes under src/routes/api/ (path-based skip)', () => {
    const source = `export function GET({ params }) {
      return new Response(\`segments: \${params.path}\`)
    }`
    const result = lintRoute(source, 'src/routes/api/echo/[...path].ts')
    expect(diagIds(result)).not.toContain('pyreon/missing-get-static-paths')
  })

  it('does NOT fire on API routes (POST handler)', () => {
    const source = `export async function POST({ request }) {
      return new Response('ok')
    }`
    const result = lintRoute(source, 'src/routes/api/posts/[id].ts')
    expect(diagIds(result)).not.toContain('pyreon/missing-get-static-paths')
  })

  it('does NOT fire on files without `export default` even outside api/ (export-shape skip)', () => {
    // Method-handler-only file outside api/ — covers users who put API
    // routes somewhere non-conventional. Page routes structurally
    // require a default export, so absence is a reliable signal.
    const source = `export function GET() { return new Response('ok') }
export function POST() { return new Response('ok') }`
    const result = lintRoute(source, 'src/routes/webhook/[id].ts')
    expect(diagIds(result)).not.toContain('pyreon/missing-get-static-paths')
  })

  it('STILL fires on page routes (with default export) without getStaticPaths', () => {
    // Sanity — make sure the export-shape skip doesn't accidentally
    // silence the rule on legitimate page routes.
    const source = `export const someHelper = 1
export default function Page() { return null }`
    const result = lintRoute(source, 'src/routes/posts/[id].tsx')
    expect(diagIds(result)).toContain('pyreon/missing-get-static-paths')
  })
})

// ─── 3) pyreon/invalid-loader-export ───────────────────────────────────────

describe('pyreon/invalid-loader-export (M3.5)', () => {
  it('FIRES on `export const loader = { data: 1 }` (object)', () => {
    const source = `export const loader = { data: 1 }
export default function Page() { return null }`
    const result = lintRoute(source, 'src/routes/posts/index.tsx')
    expect(diagIds(result)).toContain('pyreon/invalid-loader-export')
  })

  it('FIRES on `export const loader = "string"` (string literal)', () => {
    const source = `export const loader = "static-data"
export default function Page() { return null }`
    const result = lintRoute(source, 'src/routes/posts/index.tsx')
    expect(diagIds(result)).toContain('pyreon/invalid-loader-export')
  })

  it('does NOT fire on `export const loader = () => fetch(...)` (arrow fn)', () => {
    const source = `export const loader = () => fetch('/api/posts')
export default function Page() { return null }`
    const result = lintRoute(source, 'src/routes/posts/index.tsx')
    expect(diagIds(result)).not.toContain('pyreon/invalid-loader-export')
  })

  it('does NOT fire on `export async function loader()` (function decl)', () => {
    const source = `export async function loader() { return [] }
export default function Page() { return null }`
    const result = lintRoute(source, 'src/routes/posts/index.tsx')
    expect(diagIds(result)).not.toContain('pyreon/invalid-loader-export')
  })

  it('does NOT fire on `export const loader = sharedLoader` (identifier ref — defer to TS)', () => {
    const source = `import { sharedLoader } from './shared'
export const loader = sharedLoader
export default function Page() { return null }`
    const result = lintRoute(source, 'src/routes/posts/index.tsx')
    expect(diagIds(result)).not.toContain('pyreon/invalid-loader-export')
  })

  it('does NOT fire on `export const loader = makeLoader(...)` (factory call)', () => {
    const source = `import { makeLoader } from './factory'
export const loader = makeLoader({ entity: 'post' })
export default function Page() { return null }`
    const result = lintRoute(source, 'src/routes/posts/index.tsx')
    expect(diagIds(result)).not.toContain('pyreon/invalid-loader-export')
  })

  it('does NOT fire outside routes/', () => {
    const source = `export const loader = { data: 1 }`
    const result = lintRoute(source, 'src/lib/helpers.ts')
    expect(diagIds(result)).not.toContain('pyreon/invalid-loader-export')
  })
})
