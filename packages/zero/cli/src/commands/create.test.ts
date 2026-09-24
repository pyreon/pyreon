import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { argsAfterCreate, resolveCreateZeroBin, runCreate } from './create'

describe('zero create — delegates to @pyreon/create-zero', () => {
  it('resolves the installed create-zero bin', () => {
    const bin = resolveCreateZeroBin()
    expect(bin).toMatch(/create-zero[/\\]bin[/\\]create-zero\.js$/)
    expect(existsSync(bin)).toBe(true)
  })

  it('forwards every argument after `create` unchanged', () => {
    expect(argsAfterCreate(['create', 'my-app', '--template', 'blog', '--yes'])).toEqual([
      'my-app',
      '--template',
      'blog',
      '--yes',
    ])
    expect(argsAfterCreate(['create'])).toEqual([])
  })

  it('runs the real scaffolder (--help exits 0)', () => {
    // Spawns create-zero's shipped bin, which loads its built `lib/`.
    expect(runCreate(['--help'])).toBe(0)
  }, 30_000)
})
