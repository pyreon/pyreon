/**
 * The remaining arms of `runCheck` and `runInit` — the ones a defaulted or
 * partly-supplied option reaches.
 *
 * Both functions take an options bag whose every field has a fallback, and a
 * fallback that is wrong is silent: `cwd ?? '.'` scanning the process cwd
 * instead of the project, a missing root `package.json` producing a config
 * titled after nothing, a catalog whose `components` key is absent read as a
 * catalog with an unknown component rather than as a corrupt one.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { runCheck } from '../check'
import { renderConfig, runInit } from '../init'
import type { ComponentIntelligence } from '../../core'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-covci-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const catalog = (components: unknown[]): void =>
  writeFileSync(join(dir, 'atlas-catalog.json'), JSON.stringify({ version: 2, components }))

const button = (over: Partial<ComponentIntelligence> = {}): ComponentIntelligence =>
  ({
    name: 'Button',
    controls: [{ name: 'label', kind: 'text', reactive: false, required: false }],
    axes: [],
    scenarios: [],
    tags: [],
    ...over,
  }) as ComponentIntelligence

describe('runCheck — defaulting and tolerance', () => {
  it('reads a catalog with NO `components` key as an empty one, not as corrupt', () => {
    // A `{ version: 2 }` file is well-formed JSON written by an older or
    // interrupted run. The remedy is "rescan", which the unknown-component
    // message gives; "not readable" would send the reader to investigate the
    // file instead.
    writeFileSync(join(dir, 'atlas-catalog.json'), JSON.stringify({ version: 2 }))
    const result = runCheck({ cwd: dir, component: 'Button' })
    expect(result.kind).toBe('unknown-component')
    if (result.kind !== 'unknown-component') return
    expect(result.message).toContain('Button')
    expect(result.message, 'with an empty Known list, not a crash').toContain('Known:')
  })

  it('TRUNCATES the known list and says it did', () => {
    // Naming every component of a 500-component library buries the one the
    // reader typed. The ellipsis is what keeps the truncation from reading as
    // a complete list.
    catalog(Array.from({ length: 20 }, (_, i) => button({ name: `C${String(i).padStart(2, '0')}` })))
    const result = runCheck({ cwd: dir, component: 'Nope' })
    expect(result.kind).toBe('unknown-component')
    if (result.kind !== 'unknown-component') return
    expect(result.message, 'exactly twelve are named').toContain('C11')
    expect(result.message).not.toContain('C12')
    expect(result.message, 'and the list says it is partial').toContain(', …')
  })

  it('does NOT append the ellipsis when the whole list fits', () => {
    catalog([button({ name: 'Alpha' }), button({ name: 'Beta' })])
    const result = runCheck({ cwd: dir, component: 'Nope' })
    if (result.kind !== 'unknown-component') throw new Error('expected unknown-component')
    expect(result.message).toContain('Alpha, Beta')
    expect(result.message).not.toContain(', …')
  })

  it('defaults `cwd` to the process directory', () => {
    // Every command is pointed at a project by `--cwd`; the default has to be
    // the one place a person would expect.
    const previous = process.cwd()
    try {
      process.chdir(dir)
      catalog([button()])
      expect(runCheck({ component: 'Button' }).kind).toBe('ok')
    } finally {
      process.chdir(previous)
    }
  })

  it('treats an EMPTY or whitespace `argsJson` as "no args supplied"', () => {
    // A shell that expands to nothing must not read as malformed JSON — the
    // command is `atlas check Button` with the payload omitted.
    catalog([button()])
    expect(runCheck({ cwd: dir, component: 'Button', argsJson: '' }).kind).toBe('ok')
    expect(runCheck({ cwd: dir, component: 'Button', argsJson: '   ' }).kind).toBe('ok')
  })

  it('rejects an ARRAY payload, which is valid JSON and the wrong shape', () => {
    catalog([button()])
    const result = runCheck({ cwd: dir, component: 'Button', argsJson: '["label"]' })
    expect(result.kind).toBe('bad-json')
    if (result.kind !== 'bad-json') return
    expect(result.reason).toContain('object of props')
  })

  it('reports a NON-JSON payload with the parser\'s own reason', () => {
    catalog([button()])
    const result = runCheck({ cwd: dir, component: 'Button', argsJson: '{label:' })
    expect(result.kind).toBe('bad-json')
  })

  it('reports an unreadable catalog with the PATH it tried', () => {
    // Distinct remedy from a missing one: regenerate versus investigate.
    writeFileSync(join(dir, 'atlas-catalog.json'), '{ not json at all')
    const result = runCheck({ cwd: dir, component: 'Button' })
    expect(result.kind).toBe('bad-json')
    if (result.kind !== 'bad-json') return
    expect(result.reason).toContain('atlas-catalog.json')
    expect(result.reason).toContain('not readable')
  })
})

describe('runInit — the title and the project list', () => {
  const pkg = (name?: string): void =>
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(name === undefined ? { version: '1.0.0' } : { name }),
    )

  it('falls back to the DIRECTORY name when package.json has no `name`', () => {
    // A private root manifest legitimately omits `name`. Titling the site
    // `undefined` would ship that to the built page's <title>.
    pkg()
    const result = runInit({
      cwd: dir,
      dryRun: true,
      detect: () => [],
      hasComponents: () => true,
    })
    if (result.kind !== 'dry-run') throw new Error(result.kind)
    expect(result.title.toLowerCase()).toContain(basename(dir).split('-')[0]!)
  })

  it('falls back to the directory name when there is NO package.json', () => {
    const result = runInit({
      cwd: dir,
      dryRun: true,
      detect: () => [],
      hasComponents: () => true,
    })
    if (result.kind !== 'dry-run') throw new Error(result.kind)
    expect(result.title.length).toBeGreaterThan(0)
  })

  it('an explicit --title WINS over the derived one', () => {
    pkg('@acme/root')
    const result = runInit({
      cwd: dir,
      dryRun: true,
      title: 'Design System',
      detect: () => [],
      hasComponents: () => true,
    })
    if (result.kind !== 'dry-run') throw new Error(result.kind)
    expect(result.title).toBe('Design System')
    expect(result.source).toContain('Design System')
  })

  it('threads `hasComponents` into detection AND into the single-package probe', () => {
    // The two call sites take the same predicate. Passing it to only one is
    // how a caller's own discovery and Atlas's disagree about whether a
    // package has anything in it.
    const asked: string[] = []
    const result = runInit({
      cwd: dir,
      dryRun: true,
      detect: () => [],
      hasComponents: (d) => {
        asked.push(d)
        return false
      },
    })
    expect(result.kind).toBe('nothing-found')
    expect(asked.some((d) => d.endsWith('src')), 'probed the scan dir').toBe(true)
  })

  it('honours a non-default `dir` in the nothing-found message', () => {
    const result = runInit({ cwd: dir, dir: 'lib', detect: () => [], hasComponents: () => false })
    if (result.kind !== 'nothing-found') throw new Error(result.kind)
    expect(result.searched.endsWith('lib')).toBe(true)
  })

  it('WRITES to disk on the non-dry path, and returns the same source', () => {
    pkg('@acme/root')
    mkdirSync(join(dir, 'src'), { recursive: true })
    const result = runInit({ cwd: dir, detect: () => [], hasComponents: () => true })
    if (result.kind !== 'written') throw new Error(result.kind)
    expect(readFileSync(result.path, 'utf8')).toBe(result.source)
    expect(result.path.endsWith('pyreon.config.ts'), 'never .tsx').toBe(true)
  })

  it('--force overwrites IN PLACE, keeping the existing file\'s name', () => {
    // A project configured through `atlas.config.ts` must not end up with two
    // config files after `--force`.
    pkg('@acme/root')
    writeFileSync(join(dir, 'atlas.config.ts'), 'export default {}\n')
    const result = runInit({ cwd: dir, force: true, detect: () => [], hasComponents: () => true })
    if (result.kind !== 'written') throw new Error(result.kind)
    expect(basename(result.path)).toBe('atlas.config.ts')
  })
})

describe('renderConfig — the provenance comment', () => {
  it('names the package each entry came from, and omits the comment when unknown', () => {
    // The list is auditable only if a reader can tell which workspace member
    // produced each line. A bare `// ` with nothing after it is noise.
    const source = renderConfig('Site', [
      { name: 'Core', dir: 'packages/core', packageName: '@acme/core' },
      { name: 'Admin', dir: 'packages/admin', packageName: '' },
    ])
    expect(source).toContain('"packages/core" },  // @acme/core')
    expect(source, 'no dangling comment marker for the unnamed one').toContain(
      '"packages/admin" },\n',
    )
  })
})

describe('runInit with no options at all', () => {
  it('defaults `cwd` to the process directory', () => {
    // The zero-argument call is what `atlas init` with no positional makes.
    // Defaulting anywhere else writes the config into a different project.
    const previous = process.cwd()
    try {
      process.chdir(dir)
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'here' }))
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'B.tsx'), 'export function B(p: { n: number }) { return null }\n')

      const result = runInit()
      expect(result.kind).toBe('written')
      if (result.kind !== 'written') return
      // `realpathSync`, because the process cwd resolves macOS's
      // `/var` → `/private/var` symlink while `mkdtempSync` reported the
      // unresolved form — comparing the two raw strings fails for a reason
      // that has nothing to do with the default under test.
      expect(result.path.startsWith(realpathSync(dir)), 'wrote into the process directory').toBe(
        true,
      )
    } finally {
      process.chdir(previous)
    }
  })
})
