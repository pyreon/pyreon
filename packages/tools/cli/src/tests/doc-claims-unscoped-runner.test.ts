/**
 * The doc-claims gate rejects a docs page that runs one of our CLIs through a
 * package runner by its UNSCOPED bin name (#4307, #4367): `npx lathe init`
 * fetched the unrelated npm package `lathe` (a solid modeller) on a machine
 * without a local install, and `atlas`, `loom`, `zero` and the rest are taken
 * on npm too. The scoped form runs our CLI either way.
 *
 * Bisect-verified: without `findUnscopedRunnerCommands` the "reported" specs
 * see no finding.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findUnscopedRunnerCommands, pyreonBins, runDocClaimsGate } from '../doctor/gates/doc-claims'

let root = ''
const put = (rel: string, body: string): void => {
  const p = join(root, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, body)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-unscoped-'))
  put('packages/tools/lathe/package.json', JSON.stringify({ name: '@pyreon/lathe', bin: { lathe: 'bin/lathe.js' } }))
  put('packages/tools/cli/package.json', JSON.stringify({ name: '@pyreon/cli', bin: { pyreon: 'bin/pyreon.js' } }))
  put('packages/internal/x/package.json', JSON.stringify({ name: '@pyreon/x', private: true, bin: { secret: 'x.js' } }))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const codes = () => findUnscopedRunnerCommands(root).map((f) => f.message)

describe('unscoped package-runner commands in docs', () => {
  it('collects the bins of published @pyreon packages only', () => {
    expect([...pyreonBins(root)]).toEqual([
      ['pyreon', '@pyreon/cli'],
      ['lathe', '@pyreon/lathe'],
    ])
  })

  it('reports npx / bunx / pnpm dlx with an unscoped bin, in docs pages and READMEs', () => {
    put('docs/src/content/docs/lathe.md', '```bash\nnpx lathe init\n```\n- run: bunx pyreon doctor --ci\n')
    put('packages/tools/lathe/README.md', 'Run `pnpm dlx lathe generate`.\n')
    const messages = codes()
    expect(messages).toHaveLength(3)
    expect(messages[0]).toContain('docs/src/content/docs/lathe.md:2')
    expect(messages.join('\n')).toContain('not @pyreon/lathe')
    expect(findUnscopedRunnerCommands(root)[0]!.fix).toContain('npx @pyreon/lathe')
  })

  it('accepts the scoped form, a different word, and a line that names the package on purpose', () => {
    put(
      'docs/src/content/docs/ok.md',
      [
        'npx @pyreon/lathe init',
        'bunx @pyreon/cli doctor',
        'npx lathered and npx pyreonic', // other words that merely start with a bin
        'Use `bunx @pyreon/lathe`; an unscoped `npx lathe` resolves another package.',
        'npx secret', // a private package's bin is not ours to police
      ].join('\n'),
    )
    expect(codes()).toEqual([])
  })

  it('is part of the gate result', async () => {
    put('scripts/check-doc-claims.ts', '')
    put('docs/src/content/docs/a.md', 'npx lathe init\n')
    const result = await runDocClaimsGate({ cwd: root })
    expect(result.findings.some((f) => f.code === 'doc-claims/unscoped-runner-command')).toBe(true)
  })
})

describe('the bin scan and the docs walk take the shapes real repos have', () => {
  it('reads a string `bin` as the bin named after the package', () => {
    // `"bin": "bin/zero.js"` is npm's shorthand for a bin named after the
    // package; reading only the object form would leave `npx zero` unchecked.
    put('packages/zero/zero/package.json', JSON.stringify({ name: '@pyreon/zero', bin: 'bin/zero.js' }))
    expect(pyreonBins(root).get('zero')).toBe('@pyreon/zero')
  })

  it('skips a stray FILE beside the package groups, and a package.json that is not JSON', () => {
    put('packages/README.md', '# packages\n')
    put('packages/tools/broken/package.json', '{ not json')
    expect([...pyreonBins(root).keys()].sort()).toEqual(['lathe', 'pyreon'])
  })

  it('reads the LAST line of a file with no trailing newline to its end', () => {
    // The line text is cut at the next newline; with none left, the slice
    // must run to the end of the file. Cut at index -1 instead, a contrast
    // line ending in the package name loses its last character, stops
    // naming the package, and is reported as a bare instruction.
    put('packages/tools/lathe/README.md', '# lathe\n\n`npx lathe` is not ours; ours is @pyreon/lathe')
    expect(codes()).toEqual([])
    put('packages/tools/lathe/README.md', '# lathe\n\nnpx lathe init')
    expect(codes()).toEqual([
      'packages/tools/lathe/README.md:3: `npx lathe` runs the npm package named "lathe", not @pyreon/lathe, when it is not installed locally.',
    ])
  })
})
