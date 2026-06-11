/**
 * Gate finding-mapping coverage — every doctor gate's `findings.push`
 * mapping loop, driven by a fixture that actually PRODUCES findings.
 *
 * The shape-only specs in `gate-adapters.test.ts` run most gates against
 * empty fixtures, so the per-finding mapping bodies (severity-by-code
 * lookup, location threading, related-location mapping) never executed —
 * the exact statements the CI `Coverage (Full)` gate found uncovered when
 * this package measured 94.83% vs its 95% threshold. Each spec here
 * plants the minimal fixture its detector documents and asserts the
 * mapped `Finding` carries the right code prefix, severity, and location.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runAuditTestsGate } from '../doctor/gates/audit-tests'
import { runCheckDedupGate } from '../doctor/gates/check-dedup'
import { runContentAuditGate } from '../doctor/gates/content-audit'
import { runDistributionGate } from '../doctor/gates/distribution'
import { runLintGate } from '../doctor/gates/lint'
import { runSsgAuditGate } from '../doctor/gates/ssg-audit'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-gate-findings-'))
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

describe('runContentAuditGate — finding mapping', () => {
  it('maps a missing-frontmatter-title finding with error severity', async () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'content.config.ts',
      `export default defineConfig({
  collections: {
    docs: defineCollection({ type: 'pages', path: 'src/content/docs' }),
  },
})
`,
    )
    writeFile(cwd, 'src/content/docs/no-title.md', '# heading only, no frontmatter\n')
    const result = await runContentAuditGate({ cwd })
    const f = result.findings.find(
      (x) => x.code === 'content-audit/missing-frontmatter-title',
    )
    expect(f).toBeDefined()
    expect(f!.severity).toBe('error')
    expect(f!.gate).toBe('content-audit')
    expect(f!.location?.path).toContain('no-title.md')
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('maps a broken-internal-link finding including related locations', async () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'content.config.ts',
      `export default defineConfig({
  collections: {
    docs: defineCollection({ type: 'pages', path: 'src/content/docs' }),
  },
})
`,
    )
    writeFile(cwd, 'src/content/docs/a.md', '---\ntitle: A\n---\n\nSee [b](/docs/missing).\n')
    const result = await runContentAuditGate({ cwd })
    const f = result.findings.find((x) => x.code === 'content-audit/broken-internal-link')
    expect(f).toBeDefined()
    expect(f!.severity).toBe('error')
    expect(f!.message).toContain('/docs/missing')
    fs.rmSync(cwd, { recursive: true, force: true })
  })
})

describe('runSsgAuditGate — finding mapping', () => {
  it('maps dynamic-route-missing-get-static-paths through the loop', async () => {
    const cwd = makeTmpDir()
    // The detector only fires for `mode: 'ssg'` apps (SPA/SSR/ISR never
    // prerender) — give the app an SSG vite.config so the finding fires.
    writeFile(
      cwd,
      'vite.config.ts',
      `import { zero } from '@pyreon/zero'\nexport default { plugins: [zero({ mode: 'ssg' })] }\n`,
    )
    writeFile(
      cwd,
      'src/routes/[id].tsx',
      `export default function Page() {\n  return null\n}\n`,
    )
    const result = await runSsgAuditGate({ cwd })
    const f = result.findings.find((x) =>
      x.code.startsWith('ssg-audit/dynamic-route-missing-get-static-paths'),
    )
    expect(f).toBeDefined()
    expect(f!.gate).toBe('ssg-audit')
    expect(f!.location?.path).toContain('[id].tsx')
    fs.rmSync(cwd, { recursive: true, force: true })
  })
})

describe('runAuditTestsGate — finding mapping', () => {
  it('maps a high-risk mock-vnode entry into a Finding', async () => {
    const cwd = makeTmpDir()
    // Pure mock-vnode test: several vnode literals, zero real h() usage —
    // the audit's canonical HIGH-risk shape.
    writeFile(
      cwd,
      'packages/core/widget/src/tests/widget.test.ts',
      `import { describe, it, expect } from 'vitest'
import { extractThing } from '../extract'
describe('widget', () => {
  it('a', () => {
    const vnode1 = { type: 'div', props: { id: 'a' }, children: [] }
    const vnode2 = { type: 'span', props: { id: 'b' }, children: [] }
    const vnode3 = { type: 'button', props: { id: 'c' }, children: [] }
    expect(extractThing(vnode1)).toBeDefined()
    expect(extractThing(vnode2)).toBeDefined()
    expect(extractThing(vnode3)).toBeDefined()
  })
})
`,
    )
    const result = await runAuditTestsGate({ cwd, minRisk: 'low' })
    expect(result.findings.length).toBeGreaterThan(0)
    const f = result.findings[0]!
    expect(f.code).toMatch(/^audit-tests\/mock-vnode-/)
    expect(f.category).toBe('testing')
    expect(f.message).toContain('Mock-vnode test pattern')
    fs.rmSync(cwd, { recursive: true, force: true })
  })
})

describe('runCheckDedupGate — bun.lock duplicate detection', () => {
  it('parses bun.lock and maps a duplicate-version finding', async () => {
    const cwd = makeTmpDir()
    const lock = {
      lockfileVersion: 1,
      packages: {
        '@pyreon/core': ['@pyreon/core@1.0.0', {}, ''],
        'nested/node_modules/@pyreon/core': ['@pyreon/core@1.1.0', {}, ''],
        'some-plain': ['some-plain@2.0.0', {}, ''],
      },
    }
    writeFile(cwd, 'bun.lock', JSON.stringify(lock))
    const result = await runCheckDedupGate({ cwd })
    const dup = result.findings.find((f) => f.message.includes('@pyreon/core'))
    expect(dup).toBeDefined()
    expect(dup!.gate).toBe('check-dedup')
    expect(dup!.message).toMatch(/1\.0\.0/)
    expect(dup!.message).toMatch(/1\.1\.0/)
    fs.rmSync(cwd, { recursive: true, force: true })
  })

  it('ignores a malformed bun.lock without crashing', async () => {
    const cwd = makeTmpDir()
    writeFile(cwd, 'bun.lock', 'not json at all {{{')
    const result = await runCheckDedupGate({ cwd })
    expect(result.findings).toEqual([])
    fs.rmSync(cwd, { recursive: true, force: true })
  })
})

describe('runLintGate — config diagnostics surface', () => {
  it('maps malformed .pyreonlintrc.json rule options to architecture findings', async () => {
    const cwd = makeTmpDir()
    // Wrong-typed option value: exemptPaths must be string[] — a bare
    // string disables the rule and surfaces a config diagnostic.
    writeFile(
      cwd,
      '.pyreonlintrc.json',
      JSON.stringify({
        rules: {
          'pyreon/no-window-in-ssr': ['error', { exemptPaths: 'not-an-array' }],
        },
      }),
    )
    writeFile(
      cwd,
      'packages/core/widget/src/index.ts',
      `export const x = 1\n`,
    )
    writeFile(
      cwd,
      'packages/core/widget/package.json',
      JSON.stringify({ name: '@pyreon/widget', version: '0.0.1' }),
    )
    // `lint()` resolves `.pyreonlintrc.json` from process.cwd() (the gate
    // does not thread a config path) — chdir into the fixture for the run.
    const prevCwd = process.cwd()
    process.chdir(cwd)
    try {
      const result = await runLintGate({ cwd })
      const cfg = result.findings.find((f) => f.category === 'architecture')
      // The config diagnostic must surface as a finding (severity mapped).
      expect(cfg).toBeDefined()
      expect(cfg!.message).toMatch(/exemptPaths|option/i)
    } finally {
      process.chdir(prevCwd)
      fs.rmSync(cwd, { recursive: true, force: true })
    }
  })
})

describe('runDistributionGate — npm pack probe', () => {
  it('executes the pack probe against a fixture package shipping maps', async () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'packages/core/reactivity/package.json',
      JSON.stringify({
        name: '@pyreon/reactivity',
        version: '0.0.1',
        sideEffects: false,
        files: ['lib'],
      }),
    )
    writeFile(cwd, 'packages/core/reactivity/lib/index.js', 'export const x = 1\n')
    writeFile(cwd, 'packages/core/reactivity/lib/index.js.map', '{"version":3}')
    const result = await runDistributionGate({ cwd })
    // Maps present → no tarball-missing-maps finding; the probe path ran.
    const missing = result.findings.find((f) => f.code.includes('tarball-missing-maps'))
    expect(missing).toBeUndefined()
    fs.rmSync(cwd, { recursive: true, force: true })
  }, 30_000)

  it('flags a probe package whose tarball ships no maps', async () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'packages/core/reactivity/package.json',
      JSON.stringify({
        name: '@pyreon/reactivity',
        version: '0.0.1',
        sideEffects: false,
        files: ['lib', '!lib/**/*.map'],
      }),
    )
    writeFile(cwd, 'packages/core/reactivity/lib/index.js', 'export const x = 1\n')
    writeFile(cwd, 'packages/core/reactivity/lib/index.js.map', '{"version":3}')
    const result = await runDistributionGate({ cwd })
    const excluded = result.findings.find(
      (f) => f.code.includes('excludes-source-maps') || f.code.includes('tarball-missing-maps'),
    )
    expect(excluded).toBeDefined()
    fs.rmSync(cwd, { recursive: true, force: true })
  }, 30_000)
})
