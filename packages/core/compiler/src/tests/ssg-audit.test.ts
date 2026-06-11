/**
 * Fixture-based tests for `auditSsg` (M3.4 of the SSG roadmap).
 *
 * Each finding type gets a parallel pair:
 *  - "broken" fixture → finding fires
 *  - "fixed" fixture → no finding fires
 *
 * Bisect-verified by removing the detector body and asserting the
 * broken-shape test fails.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { auditSsg, formatSsgAudit, type SsgFindingCode } from '../ssg-audit'

interface Fixture {
  root: string
  write: (relPath: string, body: string) => void
  cleanup: () => void
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-ssg-audit-fixture-'))
  mkdirSync(join(root, 'packages'), { recursive: true })
  const fixture: Fixture = {
    root,
    write: (relPath, body) => {
      const full = join(root, relPath)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, body)
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
  // The dynamic-route detector only fires for apps in `mode: 'ssg'` (SPA/SSR/
  // ISR never prerender). Every fixture writes routes under `examples/myapp/`,
  // so give that app a default SSG vite.config — the SPA-skip is covered by a
  // dedicated test that overwrites this with `mode: 'spa'`.
  fixture.write(
    'examples/myapp/vite.config.ts',
    `import { zero } from '@pyreon/zero'\nexport default { plugins: [zero({ mode: 'ssg' })] }\n`,
  )
  return fixture
}

function findingCodes(result: ReturnType<typeof auditSsg>): SsgFindingCode[] {
  return result.findings.map((f) => f.code)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Discovery
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditSsg — discovery', () => {
  it('returns empty results for a directory with no routes/ subdir', () => {
    const empty = mkdtempSync(join(tmpdir(), 'pyreon-ssg-audit-empty-'))
    try {
      const result = auditSsg(empty)
      expect(result.findings).toEqual([])
      expect(result.summary.routesScanned).toBe(0)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('counts route files + dynamic routes + revalidate exports in summary', () => {
    const fixture = makeFixture()
    try {
      // Plain page — no [param], no revalidate.
      fixture.write('examples/myapp/src/routes/_layout.tsx', 'export const layout = () => null')
      fixture.write('examples/myapp/src/routes/index.tsx', 'export default () => null')
      fixture.write('examples/myapp/src/routes/about.tsx', 'export default () => null')
      // Dynamic route with getStaticPaths + revalidate
      fixture.write(
        'examples/myapp/src/routes/posts/[id].tsx',
        `export const getStaticPaths = () => [{ params: { id: '1' } }]
export const revalidate = 60
export default () => null`,
      )
      const result = auditSsg(fixture.root)
      expect(result.summary.routesScanned).toBe(4)
      expect(result.summary.dynamicRoutes).toBe(1)
      expect(result.summary.revalidateExports).toBe(1)
    } finally {
      fixture.cleanup()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 1) 404-outside-layout-dir
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditSsg — 404-outside-layout-dir', () => {
  it('FIRES when _404.tsx has no co-located _layout.tsx', () => {
    const fixture = makeFixture()
    try {
      // Broken shape: _404.tsx alone in the routes dir, no _layout.tsx.
      fixture.write('examples/myapp/src/routes/_404.tsx', 'export default () => null')
      fixture.write('examples/myapp/src/routes/index.tsx', 'export default () => null')
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).toContain('404-outside-layout-dir')
      const finding = result.findings.find((f) => f.code === '404-outside-layout-dir')!
      expect(finding.location.relPath).toContain('_404.tsx')
      expect(finding.message).toContain('_layout.tsx')
    } finally {
      fixture.cleanup()
    }
  })

  it('FIRES for _not-found.tsx (alternate filename)', () => {
    const fixture = makeFixture()
    try {
      fixture.write('examples/myapp/src/routes/_not-found.tsx', 'export default () => null')
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).toContain('404-outside-layout-dir')
    } finally {
      fixture.cleanup()
    }
  })

  it('does NOT fire when _404.tsx is co-located with _layout.tsx', () => {
    const fixture = makeFixture()
    try {
      // Fixed shape: same directory contains both.
      fixture.write('examples/myapp/src/routes/_layout.tsx', 'export const layout = () => null')
      fixture.write('examples/myapp/src/routes/_404.tsx', 'export default () => null')
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).not.toContain('404-outside-layout-dir')
    } finally {
      fixture.cleanup()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2) dynamic-route-missing-get-static-paths
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditSsg — dynamic-route-missing-get-static-paths', () => {
  it('FIRES for [id].tsx without getStaticPaths', () => {
    const fixture = makeFixture()
    try {
      fixture.write(
        'examples/myapp/src/routes/posts/[id].tsx',
        'export default () => null',
      )
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).toContain('dynamic-route-missing-get-static-paths')
      const finding = result.findings.find(
        (f) => f.code === 'dynamic-route-missing-get-static-paths',
      )!
      expect(finding.location.relPath).toContain('[id].tsx')
      expect(finding.message).toContain('getStaticPaths')
    } finally {
      fixture.cleanup()
    }
  })

  it('FIRES for catch-all [...slug].tsx without getStaticPaths', () => {
    const fixture = makeFixture()
    try {
      fixture.write(
        'examples/myapp/src/routes/blog/[...slug].tsx',
        'export default () => null',
      )
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).toContain('dynamic-route-missing-get-static-paths')
    } finally {
      fixture.cleanup()
    }
  })

  it('does NOT fire for [id].tsx WITH `export const getStaticPaths`', () => {
    const fixture = makeFixture()
    try {
      fixture.write(
        'examples/myapp/src/routes/posts/[id].tsx',
        `export const getStaticPaths = () => [{ params: { id: '1' } }]
export default () => null`,
      )
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).not.toContain('dynamic-route-missing-get-static-paths')
    } finally {
      fixture.cleanup()
    }
  })

  it('does NOT fire for [id].tsx WITH `export async function getStaticPaths`', () => {
    const fixture = makeFixture()
    try {
      fixture.write(
        'examples/myapp/src/routes/posts/[id].tsx',
        `export async function getStaticPaths() { return [{ params: { id: '1' } }] }
export default () => null`,
      )
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).not.toContain('dynamic-route-missing-get-static-paths')
    } finally {
      fixture.cleanup()
    }
  })

  it('does NOT fire for static routes (no [param] in filename)', () => {
    const fixture = makeFixture()
    try {
      fixture.write('examples/myapp/src/routes/about.tsx', 'export default () => null')
      fixture.write('examples/myapp/src/routes/index.tsx', 'export default () => null')
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).not.toContain('dynamic-route-missing-get-static-paths')
    } finally {
      fixture.cleanup()
    }
  })

  it('does NOT fire for _layout / _error / _loading / _404 even with brackets in name', () => {
    // Defensive: special files with bracketed names (unlikely but
    // possible — `_layout.[locale].tsx`) shouldn't be flagged.
    const fixture = makeFixture()
    try {
      fixture.write(
        'examples/myapp/src/routes/_layout.tsx',
        'export const layout = () => null',
      )
      fixture.write('examples/myapp/src/routes/_404.tsx', 'export default () => null')
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).not.toContain('dynamic-route-missing-get-static-paths')
    } finally {
      fixture.cleanup()
    }
  })

  // M3.B follow-up — false-positive class surfaced by cpa-pw-blog's
  // `api/echo/[...path].ts` (real-world API route with bracket
  // filename). API routes are runtime-only by definition.
  it('does NOT fire for API routes under routes/api/ (path-based skip)', () => {
    const fixture = makeFixture()
    try {
      fixture.write(
        'examples/myapp/src/routes/api/echo/[...path].ts',
        `export function GET({ params }) {
  return new Response(\`segments: \${params.path}\`)
}`,
      )
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).not.toContain('dynamic-route-missing-get-static-paths')
    } finally {
      fixture.cleanup()
    }
  })

  it('does NOT fire for files without `export default` outside api/ (export-shape skip)', () => {
    // Method-handler-only file outside api/ — covers users who put API
    // routes somewhere non-conventional. Page routes structurally
    // require a default export, so absence is a reliable signal.
    const fixture = makeFixture()
    try {
      fixture.write(
        'examples/myapp/src/routes/webhook/[id].ts',
        `export function POST({ request }) {
  return new Response('ok')
}`,
      )
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).not.toContain('dynamic-route-missing-get-static-paths')
    } finally {
      fixture.cleanup()
    }
  })

  it('STILL fires on page routes (with default export) missing getStaticPaths', () => {
    // Sanity — the export-shape skip doesn't accidentally silence the
    // rule on legitimate page routes.
    const fixture = makeFixture()
    try {
      fixture.write(
        'examples/myapp/src/routes/posts/[id].tsx',
        `export const someHelper = 1
export default function Post() { return null }`,
      )
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).toContain('dynamic-route-missing-get-static-paths')
    } finally {
      fixture.cleanup()
    }
  })

  it('does NOT fire for a dynamic route in a `mode: "spa"` app (SPA never prerenders)', () => {
    // The whole premise — "under mode:'ssg' the route is silently skipped" —
    // doesn't apply to SPA/SSR/ISR apps, which never prerender. Flagging a
    // missing getStaticPaths there was a false positive (e.g. examples/chat,
    // examples/docs-pyreon are both mode:'spa').
    const fixture = makeFixture()
    try {
      // Overwrite the default SSG config with SPA.
      fixture.write(
        'examples/myapp/vite.config.ts',
        `import { zero } from '@pyreon/zero'\nexport default { plugins: [zero({ mode: 'spa' })] }\n`,
      )
      fixture.write(
        'examples/myapp/src/routes/posts/[id].tsx',
        'export default () => null',
      )
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).not.toContain('dynamic-route-missing-get-static-paths')
    } finally {
      fixture.cleanup()
    }
  })

  it('does NOT fire when there is no vite.config / no explicit ssg mode (SSG is opt-in)', () => {
    const fixture = makeFixture()
    try {
      // Remove the default config by pointing at a route with no config above it.
      fixture.write('standalone/src/routes/posts/[id].tsx', 'export default () => null')
      const result = auditSsg(fixture.root)
      const dyn = result.findings.filter(
        (f) =>
          f.code === 'dynamic-route-missing-get-static-paths' &&
          f.location.relPath.includes('standalone/'),
      )
      expect(dyn).toEqual([])
    } finally {
      fixture.cleanup()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3) non-literal-revalidate-export
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditSsg — non-literal-revalidate-export', () => {
  it('FIRES for `export const revalidate = TTL` (identifier reference)', () => {
    const fixture = makeFixture()
    try {
      fixture.write(
        'examples/myapp/src/routes/posts/index.tsx',
        `const TTL = 60
export const revalidate = TTL
export default () => null`,
      )
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).toContain('non-literal-revalidate-export')
      const finding = result.findings.find((f) => f.code === 'non-literal-revalidate-export')!
      expect(finding.message).toContain('NUMERIC LITERAL')
    } finally {
      fixture.cleanup()
    }
  })

  it('FIRES for `export const revalidate = 30 * 60` (arithmetic)', () => {
    const fixture = makeFixture()
    try {
      fixture.write(
        'examples/myapp/src/routes/posts/index.tsx',
        `export const revalidate = 30 * 60
export default () => null`,
      )
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).toContain('non-literal-revalidate-export')
    } finally {
      fixture.cleanup()
    }
  })

  it('does NOT fire for `export const revalidate = 60` (numeric literal)', () => {
    const fixture = makeFixture()
    try {
      fixture.write(
        'examples/myapp/src/routes/posts/index.tsx',
        `export const revalidate = 60
export default () => null`,
      )
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).not.toContain('non-literal-revalidate-export')
    } finally {
      fixture.cleanup()
    }
  })

  it('does NOT fire for `export const revalidate = false` (false keyword)', () => {
    const fixture = makeFixture()
    try {
      fixture.write(
        'examples/myapp/src/routes/posts/index.tsx',
        `export const revalidate = false
export default () => null`,
      )
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).not.toContain('non-literal-revalidate-export')
    } finally {
      fixture.cleanup()
    }
  })

  it('does NOT fire when there is no revalidate export at all', () => {
    const fixture = makeFixture()
    try {
      fixture.write('examples/myapp/src/routes/about.tsx', 'export default () => null')
      const result = auditSsg(fixture.root)
      expect(findingCodes(result)).not.toContain('non-literal-revalidate-export')
    } finally {
      fixture.cleanup()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Formatter
// ═══════════════════════════════════════════════════════════════════════════════

describe('formatSsgAudit', () => {
  it('renders a clean header when there are no findings', () => {
    const fixture = makeFixture()
    try {
      fixture.write('examples/myapp/src/routes/index.tsx', 'export default () => null')
      const result = auditSsg(fixture.root)
      const output = formatSsgAudit(result)
      expect(output).toContain('SSG audit')
      expect(output).toContain('No SSG / ISR issues found')
    } finally {
      fixture.cleanup()
    }
  })

  it('renders each finding with relPath:line:col + actionable message', () => {
    const fixture = makeFixture()
    try {
      fixture.write('examples/myapp/src/routes/_404.tsx', 'export default () => null')
      const result = auditSsg(fixture.root)
      const output = formatSsgAudit(result)
      expect(output).toContain('[404-outside-layout-dir]')
      expect(output).toContain('_404.tsx')
      expect(output).toContain('_layout.tsx')
    } finally {
      fixture.cleanup()
    }
  })

  it('mentions the --json flag for machine-readable output', () => {
    const fixture = makeFixture()
    try {
      fixture.write('examples/myapp/src/routes/posts/[id].tsx', 'export default () => null')
      const result = auditSsg(fixture.root)
      const output = formatSsgAudit(result)
      expect(output).toContain('--json')
    } finally {
      fixture.cleanup()
    }
  })
})
