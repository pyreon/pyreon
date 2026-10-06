import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { auditIslands, formatIslandAudit } from '../island-audit'
import { diagnoseError } from '../diagnose'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-island-project-'))
  roots.push(root)
  const write = (file: string, content: string) => {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  return { root, write }
}
const island = (name: string) =>
  `export const C = island(() => import('./C'), { name: '${name}', hydrate: 'load' })`

describe('island audits use the nearest project boundary', () => {
  it('audits a flat application and retains both defect and corrected controls', () => {
    const { root, write } = fixture()
    write('package.json', '{"name":"app"}')
    write('packages', 'a data file, not a workspace directory')
    write('a.tsx', island('Shared'))
    write('b.tsx', island('Shared'))
    const broken = auditIslands(root)
    expect(broken.root).toBe(root)
    expect(broken.summary.filesScanned).toBe(2)
    expect(broken.findings.map((f) => f.code)).toContain('duplicate-name')
    write('b.tsx', island('Other'))
    expect(auditIslands(root).findings.map((f) => f.code)).not.toContain('duplicate-name')
  })

  it('keeps an app inside a monorepo isolated while preserving an explicit repo audit', () => {
    const { root, write } = fixture()
    write('package.json', '{"name":"workspace","workspaces":["packages/*"]}')
    write('packages/a/package.json', '{"name":"a"}')
    write('packages/a/src/a.tsx', island('Shared'))
    write('packages/b/package.json', '{"name":"b"}')
    write('packages/b/src/b.tsx', island('Shared'))
    const appRoot = join(root, 'packages/a')
    const app = auditIslands(join(appRoot, 'src'))
    expect(app.root).toBe(appRoot)
    expect(app.summary.filesScanned).toBe(1)
    expect(app.findings.map((f) => f.code)).not.toContain('duplicate-name')
    const repo = auditIslands(root)
    expect(repo.root).toBe(root)
    expect(repo.summary.filesScanned).toBe(2)
    expect(repo.findings.map((f) => f.code)).toContain('duplicate-name')
  })

  it('includes author src/lib modules while omitting package build output', () => {
    const { root, write } = fixture()
    write('package.json', '{"name":"app"}')
    write('src/lib/a.tsx', island('Shared'))
    write('src/lib/b.tsx', island('Shared'))
    write('lib/built.js', island('Built'))
    write('dist/built.js', island('Built'))
    write('build/built.js', island('Built'))
    write('node_modules/vendor/index.js', island('Built'))
    const result = auditIslands(root)
    expect(result.summary.filesScanned).toBe(2)
    expect(result.summary.islandsDeclared).toBe(2)
    expect(result.findings.map((f) => f.code)).toContain('duplicate-name')
    expect(result.findings.some((f) => f.location.relPath.startsWith('lib/'))).toBe(false)
  })

  it('keeps workspace source and a workspace package named lib visible', () => {
    const { root, write } = fixture()
    write('package.json', '{"name":"workspace","workspaces":["packages/*"]}')
    write('packages/lib/package.json', '{"name":"lib"}')
    write('packages/lib/src/a.tsx', island('One'))
    write('packages/app/package.json', '{"name":"app"}')
    write('packages/app/src/a.tsx', island('Two'))
    write('packages/app/lib/built.js', island('Built'))
    write('src/lib/root.tsx', island('Three'))
    const result = auditIslands(root)
    expect(result.summary.filesScanned).toBe(3)
    expect(result.summary.islandsDeclared).toBe(3)
  })
})

describe('duplicate-island diagnostic guidance', () => {
  it('explains the real audit warning and stays silent on the corrected report', () => {
    const { root, write } = fixture()
    write('packages/a/src/a.tsx', island('Shared'))
    write('packages/b/src/b.tsx', island('Shared'))
    const diagnostic = diagnoseError(formatIslandAudit(auditIslands(root)))
    expect(diagnostic?.cause).toContain('registry name')
    expect(diagnostic?.fix).toContain('unique')
    write('packages/b/src/b.tsx', island('Other'))
    expect(diagnoseError(formatIslandAudit(auditIslands(root)))).toBeNull()
  })
})
