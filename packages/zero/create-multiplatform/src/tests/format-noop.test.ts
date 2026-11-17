/**
 * A fresh project's first `bun run format` changes nothing.
 *
 * The scaffold ships `oxfmt.config.ts` re-exporting `@pyreon/lint/oxfmt`'s
 * `readableStrict`. Every file it writes is a string inside `scaffold.ts`
 * (App.tsx, entry-web.tsx, package.json, the JSON configs, index.html, the
 * Maestro flow, README.md and the AI instruction files); if they were not
 * already in that shape, the first format would rewrite a dozen files the user
 * never touched. This runs the real oxfmt binary in check mode over generated
 * projects with the shipped preset. Names vary because the name reaches
 * package.json, the HTML title and the bundle id, so it can change line
 * lengths and key order.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { readableStrict } from '@pyreon/lint/oxfmt'
import { afterAll, describe, expect, it } from 'vitest'
import { buildScaffold, jsonFile, type ScaffoldOptions } from '../scaffold'

const OXFMT = join(import.meta.dirname, '..', '..', '..', '..', '..', 'node_modules', '.bin', 'oxfmt')
const work = mkdtempSync(join(tmpdir(), 'cmp-format-'))
afterAll(() => rmSync(work, { recursive: true, force: true }))
const CONFIG = join(work, 'oxfmt.json')
// The repo's own .gitignore must not hide generated files.
const NO_IGNORE = join(work, 'empty-ignore')
writeFileSync(CONFIG, JSON.stringify(readableStrict))
writeFileSync(NO_IGNORE, '')

/** Files oxfmt would rewrite under `root`. */
function unformatted(root: string): string[] {
  try {
    execFileSync(OXFMT, ['--list-different', '--ignore-path', NO_IGNORE, '-c', CONFIG, root], {
      encoding: 'utf8',
    })

    return []
  } catch (err) {
    const out = String((err as { stdout?: unknown }).stdout ?? '')
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('Finished'))
      .map((l) => l.replace(root, ''))
  }
}

function writeProject(opts: ScaffoldOptions): string {
  const dir = mkdtempSync(join(work, 'p-'))
  for (const file of buildScaffold(opts)) {
    const abs = join(dir, file.path)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, file.content)
  }

  return dir
}

describe('the first `bun run format` of a new multiplatform project is a no-op', () => {
  it('the formatter binary is installed (a missing one must fail, not skip)', () => {
    expect(existsSync(OXFMT), OXFMT).toBe(true)
  })

  const variants: ScaffoldOptions[] = [
    { name: 'demo-app' },
    { name: 'x' },
    { name: 'a-much-longer-project-name-that-pushes-line-lengths' },
    { name: 'Zeta App', scheme: 'zeta' },
  ]
  for (const opts of variants) {
    it(`${JSON.stringify(opts)}`, () => {
      expect(unformatted(writeProject(opts))).toEqual([])
    })
  }

  // The generator's JSON helper against the formatter itself, on the shapes
  // the scaffold does not happen to emit today: a long array must stay
  // expanded, nested and empty arrays, and escaped strings.
  it('jsonFile lays out JSON exactly as the formatter does', () => {
    const dir = mkdtempSync(join(work, 'json-'))
    writeFileSync(
      join(dir, 'probe.json'),
      jsonFile({
        short: ['a', 'b'],
        long: Array.from({ length: 12 }, (_, i) => `entry-number-${i}`),
        nested: { list: [1, 2.5, -3, true, null], empty: [] },
        escaped: ['quote " here', 'back\\slash'],
        objects: [{ a: 1 }, { b: ['x'] }],
      }),
    )
    expect(unformatted(dir)).toEqual([])
  })
})
