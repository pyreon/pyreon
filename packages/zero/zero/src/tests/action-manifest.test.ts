/**
 * The build-time action manifest: which files it scans, and the module it
 * emits. A missed file means an action that answers "Action not found" on a
 * fresh server until something happens to load its module.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateActionManifest, isActionSourceFile, mayDefineActions, scanActionModules } from '../action-manifest'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'zero-action-manifest-'))
  dirs.push(root)
  for (const [rel, src] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, src)
  }
  return root
}

const ACTION = `import { defineAction } from '@pyreon/zero/actions'\nexport const save = defineAction(async () => 1)\n`

describe('scanActionModules', () => {
  it('finds actions under src, skipping tests, dotfiles, node_modules and non-source files', () => {
    const root = project({
      'src/routes/posts.ts': ACTION,
      'src/routes/posts.test.ts': ACTION,
      'src/tests/helper.ts': ACTION,
      'src/node_modules/pkg/index.ts': ACTION,
      'src/.hidden/x.ts': ACTION,
      'src/notes.md': ACTION,
      'src/plain.ts': 'export const x = 1\n',
    })
    const found = scanActionModules(root)
    expect([...found.values()]).toEqual([join(root, 'src/routes/posts.ts')])
  })

  it('is empty when the project has no src directory', () => {
    expect(scanActionModules(project({ 'README.md': '' })).size).toBe(0)
  })
})

describe('generateActionManifest', () => {
  it('emits no code for an app without actions', () => {
    const out = generateActionManifest(project({ 'src/a.ts': 'export const a = 1\n' }))
    expect(out.code).toBe('')
    expect(out.files.size).toBe(0)
  })

  it('registers each action id with a lazy import of its module', () => {
    const root = project({ 'src/b.ts': ACTION, 'src/a.ts': ACTION.replace('save', 'load') })
    const out = generateActionManifest(root)
    expect(out.code).toContain('_registerActionModules({')
    expect(out.code).toContain(`() => import(${JSON.stringify(join(root, 'src/a.ts'))})`)
    expect(out.files.size).toBe(2)
  })
})

describe('mayDefineActions / isActionSourceFile', () => {
  it('needs both the actions import and a defineAction call', () => {
    expect(mayDefineActions(ACTION)).toBe(true)
    expect(mayDefineActions('defineAction()')).toBe(false)
  })

  it('accepts source files, not tests or declarations', () => {
    expect(isActionSourceFile('a.tsx')).toBe(true)
    expect(isActionSourceFile('a.test.ts')).toBe(false)
    expect(isActionSourceFile('a.d.ts')).toBe(false)
  })
})
