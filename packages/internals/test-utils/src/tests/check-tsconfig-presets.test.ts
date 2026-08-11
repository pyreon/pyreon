import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkTsconfigPresets,
  EXEMPT,
  stripJsonComments,
} from '../../../../../scripts/check-tsconfig-presets'

// Contract test for the @pyreon/tsconfig drift guard: every package/example
// tsconfig must extend a shared preset; template trees are never scanned;
// the root config must point at base.json. Runs against SYNTHETIC repo trees
// (not the live repo — the live repo is covered by the gate itself in
// validate-fast, and a fixture tree keeps the specs hermetic).

let dir: string

const mk = (rel: string, content: object | string) => {
  const p = path.join(dir, rel)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content))
}

const scaffold = () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tsconfig-gate-'))
  mk('tsconfig.json', { extends: '@pyreon/tsconfig/base.json' })
}

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('check-tsconfig-presets', () => {
  it('passes when every config extends a preset (packages, examples, jsonc comments)', () => {
    scaffold()
    mk('packages/fundamentals/foo/tsconfig.json', {
      extends: '@pyreon/tsconfig/lib-jsx.json',
    })
    mk('packages/internals/bar/tsconfig.json', {
      extends: '@pyreon/tsconfig/internal.json',
      compilerOptions: { types: ['node'] },
    })
    mk(
      'examples/demo/tsconfig.json',
      '{\n  // rationale comment survives parsing\n  "extends": "@pyreon/tsconfig/example.json"\n}',
    )
    expect(checkTsconfigPresets(dir)).toEqual([])
  })

  it('flags a config that extends the root tsconfig directly (the pre-consolidation shape)', () => {
    scaffold()
    mk('packages/fundamentals/foo/tsconfig.json', {
      extends: '../../../tsconfig.json',
      compilerOptions: { outDir: './lib' },
    })
    const findings = checkTsconfigPresets(dir)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.file).toBe('packages/fundamentals/foo/tsconfig.json')
    expect(findings[0]!.problem).toContain('must extend an @pyreon/tsconfig preset')
  })

  it('flags a config with no extends at all', () => {
    scaffold()
    mk('examples/loner/tsconfig.json', { compilerOptions: { noEmit: true } })
    const findings = checkTsconfigPresets(dir)
    expect(findings.some((f) => f.file === 'examples/loner/tsconfig.json')).toBe(true)
  })

  it('never scans user-shipped template trees', () => {
    scaffold()
    mk('packages/zero/create-zero/templates/app/tsconfig.json', {
      compilerOptions: { strict: true },
    })
    expect(checkTsconfigPresets(dir)).toEqual([])
  })

  it('flags a root tsconfig that does not point at base.json', () => {
    scaffold()
    mk('tsconfig.json', { extends: '@vitus-labs/tools-typescript/lib' })
    const findings = checkTsconfigPresets(dir)
    expect(findings.some((f) => f.file === 'tsconfig.json')).toBe(true)
  })

  it('EXEMPT entries are honored (and the list documents its rationale contract)', () => {
    scaffold()
    mk('packages/tools/odd/tsconfig.json', { compilerOptions: {} })
    const before = checkTsconfigPresets(dir)
    expect(before.some((f) => f.file === 'packages/tools/odd/tsconfig.json')).toBe(true)
    EXEMPT['packages/tools/odd/tsconfig.json'] = 'test rationale'
    try {
      const after = checkTsconfigPresets(dir)
      expect(after.some((f) => f.file === 'packages/tools/odd/tsconfig.json')).toBe(false)
    } finally {
      delete EXEMPT['packages/tools/odd/tsconfig.json']
    }
  })
})

// The JSONC stripper.
//
// Comments are stripped before parsing, and the regex pair that used to do it
// could not tell a real comment from `/*` appearing inside a string or inside
// another comment. A tsconfig is full of both — scoped globs (`@pyreon/*`) and
// path globs (`**` + `/lib/**`) — so a comment mentioning one opened a block
// comment that a later path closed, deleting every option in between.
//
// That is how `incremental` and `tsBuildInfoFile` vanished from `base.json`:
// the file reported as unparseable, which failed loudly. The dangerous version
// of the same bug leaves JSON that still PARSES and is quietly missing options,
// so the property worth pinning is that quoting is honoured, not that a
// particular file survives.
describe('stripJsonComments', () => {
  const parsed = (s: string) => JSON.parse(stripJsonComments(s)) as Record<string, unknown>

  it('does not treat `/*` inside a comment as a block-comment opener', () => {
    const src = `{
  // mentions @pyreon/* in prose
  "a": 1,
  "exclude": ["\${configDir}/**/lib/**"],
  "b": 2
}`
    // Pre-fix this threw: the fake opener ran to the `*/` inside the glob and
    // swallowed "a" and "exclude" with it.
    expect(parsed(src)).toEqual({ a: 1, exclude: ['${configDir}/**/lib/**'], b: 2 })
  })

  it('does not treat `//` or `/*` inside a STRING as a comment', () => {
    const src = `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "paths": { "@x/*": ["./src/*"] },
  "keep": true
}`
    expect(parsed(src)).toEqual({
      $schema: 'https://json.schemastore.org/tsconfig',
      paths: { '@x/*': ['./src/*'] },
      keep: true,
    })
  })

  it('still strips genuine line and block comments', () => {
    const src = `{
  /* a block comment */
  "a": 1, // trailing line comment
  "b": 2
}`
    expect(parsed(src)).toEqual({ a: 1, b: 2 })
  })

  it('keeps an escaped quote from ending a string early', () => {
    expect(parsed('{ "a": "he said \\" // not a comment", "b": 1 }')).toEqual({
      a: 'he said " // not a comment',
      b: 1,
    })
  })
})
