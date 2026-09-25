import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CODEMODS, type Codemod, selectCodemods } from '../codemods'
import { zeroRemoveViteOption } from '../codemods/zero-remove-vite-option'
import { upgrade } from '../upgrade'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const CONFIG = `import { defineConfig } from 'vite'
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'

export default defineConfig({
  plugins: [pyreon(), zero({ mode: 'ssg', vite: { server: { port: 3000 } }, base: '/' })],
})
`

function project(zeroRange: string): string {
  const d = mkdtempSync(join(tmpdir(), 'pyreon-upgrade-codemod-'))
  dirs.push(d)
  writeFileSync(
    join(d, 'package.json'),
    JSON.stringify({ dependencies: { '@pyreon/zero': zeroRange, '@pyreon/core': zeroRange } }),
  )
  writeFileSync(join(d, 'vite.config.ts'), CONFIG)
  mkdirSync(join(d, 'node_modules', 'x'), { recursive: true })
  writeFileSync(join(d, 'node_modules', 'x', 'vite.config.ts'), CONFIG)
  return d
}

describe('codemod registry', () => {
  it('ids are unique kebab-case and versions are x.y.z', () => {
    const ids = CODEMODS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of CODEMODS) {
      expect(c.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(c.introducedIn).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })

  it('selects exactly the codemods an upgrade crosses, oldest first', () => {
    const mk = (id: string, v: string): Codemod => ({ ...zeroRemoveViteOption, id, introducedIn: v })
    const all = [mk('b', '0.53.0'), mk('a', '0.52.0'), mk('c', '0.60.0')]
    expect(selectCodemods('0.51.0', '0.53.0', all).map((c) => c.id)).toEqual(['a', 'b'])
    expect(selectCodemods('0.52.0', '0.53.0', all).map((c) => c.id)).toEqual(['b'])
    expect(selectCodemods('0.53.0', '0.53.0', all)).toEqual([])
  })
})

describe('zero-remove-vite-option', () => {
  it('removes the vite property from zero({...}) and keeps it as a comment', () => {
    const out = zeroRemoveViteOption.transform(CONFIG, 'vite.config.ts')
    expect(out).not.toBeNull()
    expect(out).not.toMatch(/^\s*vite:/m)
    expect(out).toContain("zero({ mode: 'ssg', // Removed by `pyreon upgrade`")
    expect(out).toContain("base: '/' })")
    expect(out).toContain('// vite: { server: { port: 3000 } }')
  })

  it('is idempotent and leaves a vite key outside zero() alone', () => {
    const once = zeroRemoveViteOption.transform(CONFIG, 'vite.config.ts') as string
    expect(zeroRemoveViteOption.transform(once, 'vite.config.ts')).toBeNull()
    const other = "export default { vite: 1, plugins: [other({ vite: 2 })] }\nzero()\n"
    expect(zeroRemoveViteOption.transform(other, 'vite.config.ts')).toBeNull()
  })

  it('removes a multi-line vite property without breaking the object', () => {
    const src = "zero({\n  mode: 'ssr',\n  vite: {\n    server: { port: 1 },\n  },\n  base: '/x/',\n})\n"
    const out = zeroRemoveViteOption.transform(src, 'vite.config.ts') as string
    // The result must still parse as an object with the other keys intact.
    const obj = new Function('zero', `return ${out.replace(/;?\s*$/, '')}`)((o: unknown) => o) as Record<string, unknown>
    expect(obj).toEqual({ mode: 'ssr', base: '/x/' })
  })
})

describe('pyreon upgrade runs the codemods it crosses', () => {
  it('--json lists pending codemods; a dry run does not write', () => {
    const d = project('^0.51.0')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(upgrade({ cwd: d, to: '0.52.0', json: true })).toBe(0)
    const out = JSON.parse(String(log.mock.calls[0]?.[0])) as { codemods: { id: string; files: string[] }[] }
    expect(out.codemods).toEqual([{ id: 'zero-remove-vite-option', files: ['vite.config.ts'] }])
    expect(readFileSync(join(d, 'vite.config.ts'), 'utf-8')).toBe(CONFIG)
  })

  it('--write applies it (and never touches node_modules)', () => {
    const d = project('^0.51.0')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    upgrade({ cwd: d, to: '0.52.0', write: true })
    expect(readFileSync(join(d, 'vite.config.ts'), 'utf-8')).not.toMatch(/^\s*[^/\s].*\bvite:/m)
    expect(readFileSync(join(d, 'node_modules', 'x', 'vite.config.ts'), 'utf-8')).toBe(CONFIG)
  })

  it('an upgrade that does not cross the version runs nothing', () => {
    const d = project('^0.52.0')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    upgrade({ cwd: d, to: '0.53.0', json: true })
    const out = JSON.parse(String(log.mock.calls[0]?.[0])) as { codemods: unknown[] }
    expect(out.codemods).toEqual([])
  })
})
