// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readGeneratedDiff } from '../../../../../docs/scripts/check-generated-fresh'

let root: string
const paths = ['generated']

function git(...args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-generated-fresh-'))
  mkdirSync(join(root, 'generated'))
  writeFileSync(join(root, 'generated/page.md'), 'original\n')
  writeFileSync(join(root, 'unrelated.md'), 'original\n')
  git('init', '--quiet')
  git('add', 'generated/page.md', 'unrelated.md')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('generated output comparison', () => {
  it('accepts unchanged output without needing a commit', () => {
    expect(readGeneratedDiff(root, paths)).toBe('')
  })

  it('reports changed tracked output', () => {
    writeFileSync(join(root, 'generated/page.md'), 'regenerated\n')
    expect(readGeneratedDiff(root, paths)).toBe('generated/page.md')
  })

  it('ignores unrelated working-tree changes', () => {
    writeFileSync(join(root, 'unrelated.md'), 'changed\n')
    expect(readGeneratedDiff(root, paths)).toBe('')
  })

  it('reports newly generated output that has not been staged', () => {
    writeFileSync(join(root, 'generated/new.md'), 'new page\n')
    expect(readGeneratedDiff(root, paths)).toBe('generated/new.md')
  })

  it('accepts staged generated output before committing', () => {
    writeFileSync(join(root, 'generated/new.md'), 'new page\n')
    git('add', 'generated/new.md')
    expect(readGeneratedDiff(root, paths)).toBe('')
  })

  it('rejects a real Git comparison failure', () => {
    rmSync(join(root, '.git'), { recursive: true })
    expect(() => readGeneratedDiff(root, paths)).toThrow(/git diff failed/)
  })

  it('rejects failure to start Git in a missing directory', () => {
    expect(() => readGeneratedDiff(join(root, 'missing'), paths)).toThrow(/git diff failed/)
  })
})
