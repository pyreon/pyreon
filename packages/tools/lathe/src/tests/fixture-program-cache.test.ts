/**
 * `createFixtureProgram` reuses the parse of files that cannot change during a
 * run (the lib `.d.ts` set, the framework source) and must never reuse a
 * fixture's: a suite rewrites its fixture tree between cases, and a cached
 * parse would typecheck the OLD output and pass.
 */
import ts from 'typescript'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFixtureProgram, generatedDiagnostics } from './helpers/typecheck'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '.generated', 'fixture-program-cache')
const ENTRY = join(ROOT, 'entry.ts')

const OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  lib: ['lib.es2022.d.ts'],
}

function check(contents: string): { errors: string[]; program: ts.Program } {
  mkdirSync(dirname(ENTRY), { recursive: true })
  writeFileSync(ENTRY, contents)
  const program = createFixtureProgram([ENTRY], OPTIONS)
  const errors = generatedDiagnostics(program, [ENTRY]).map((d) => `TS${d.code}`)

  return { errors, program }
}

afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

describe('createFixtureProgram', () => {
  it('re-reads a rewritten fixture instead of serving its earlier parse', () => {
    expect(check('export const n: number = 1\n').errors).toEqual([])
    expect(check("export const n: number = 'one'\n").errors).toEqual(['TS2322'])
    expect(check('export const n: number = 2\n').errors).toEqual([])
  })

  it('shares the parse of a lib file between programs', () => {
    const lib = (p: ts.Program) =>
      p.getSourceFiles().find((f) => f.fileName.endsWith('lib.es5.d.ts'))
    const a = lib(check('export {}\n').program)
    const b = lib(check('export {}\n').program)

    expect(a).toBeDefined()
    expect(b).toBe(a)
  })
})
