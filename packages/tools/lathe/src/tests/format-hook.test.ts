/**
 * `format` — the project's formatter, applied before a file is written AND
 * before `check` / `checkOnBuild` compare, in the CLI and the Vite plugin
 * alike. (The shipped-bin version of the check-agrees property lives in
 * `bin-plugin-config.test.ts`.)
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatFiles } from '../core/format'
import { runPass } from '../vite/plugin'
import { CUSTOMIZE_SPEC } from './helpers/customize-spec'

const upper = (code: string, path: string): string => (path.endsWith('.ts') ? `${code}// formatted by test\n` : code)

describe('formatFiles', () => {
  const files = [
    { path: 'client.ts', contents: 'a\n' },
    { path: 'docs/index.md', contents: '# x\n' },
    { path: 'lathe-manifest.json', contents: '{}\n' },
    { path: 'api-surface.json', contents: '{}\n' },
  ]

  it('formats every file but Lathe\'s own bookkeeping, keeping the order', async () => {
    const seen: string[] = []
    const out = await formatFiles(files, (code, path) => {
      seen.push(path)
      return code.toUpperCase()
    })
    expect(seen.sort()).toEqual(['client.ts', 'docs/index.md'])
    expect(out.map((f) => f.path)).toEqual(files.map((f) => f.path))
    expect(out[0]?.contents).toBe('A\n')
    expect(out[2]?.contents).toBe('{}\n')
  })

  it('accepts an async formatter, and is the identity without one', async () => {
    expect((await formatFiles(files, async (c) => `${c}!`))[0]?.contents).toBe('a\n!')
    expect(await formatFiles(files, undefined)).toEqual(files)
  })

  it('attributes a failure to the file, and refuses a non-string result', async () => {
    await expect(
      formatFiles(files, (_c, path) => {
        if (path === 'docs/index.md') throw new Error('no parser for markdown')
        return _c
      }),
    ).rejects.toThrow('[Pyreon] lathe: `format` failed on `docs/index.md`: no parser for markdown')
    await expect(formatFiles(files, () => undefined as unknown as string)).rejects.toThrow(
      /returned undefined for `client.ts` — it must return the formatted source/,
    )
  })
})

describe('the Vite plugin formats before it writes and before it checks', () => {
  let root = ''
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lathe-format-'))
    mkdirSync(join(root, '.git'))
    writeFileSync(join(root, 'openapi.json'), CUSTOMIZE_SPEC)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('writes formatted output, which `check` then reports as current', async () => {
    const opts = { input: './openapi.json', output: './gen', plugins: ['schemas', 'client'] as const, format: upper }
    await runPass({ ...opts, plugins: [...opts.plugins] }, root, 'write')
    expect(readFileSync(join(root, 'gen', 'client.ts'), 'utf8').endsWith('// formatted by test\n')).toBe(true)
    expect((await runPass({ ...opts, plugins: [...opts.plugins] }, root, 'check')).stale).toEqual([])
    // Without the formatter, the same committed output IS stale.
    const unformatted = await runPass({ ...opts, plugins: [...opts.plugins], format: undefined }, root, 'check')
    expect(unformatted.stale.length).toBeGreaterThan(0)
  })
})
