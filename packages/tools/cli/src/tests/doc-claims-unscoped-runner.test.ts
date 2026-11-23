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
import {
  findUnscopedRunnerCommands,
  pyreonBins,
  RUNNER_COMMAND_ALLOWANCES,
  runDocClaimsGate,
  stringLiteralText,
} from '../doctor/gates/doc-claims'

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

// The same command printed by a CLI, written into a diagnostic's `fix`, or
// emitted into a generated README is read and run exactly like one on a docs
// page — `pyreon add @pyreon/loom` printed `npx loom scan .`, and the
// compiler's diagnostics told users to run `npx pyreon upgrade`. Only string
// and template text counts: a source COMMENT is for maintainers.
describe('unscoped runner commands in user-facing source strings', () => {
  it('reports string and template text in published source', () => {
    put('packages/tools/cli/src/recipes.ts', "export const usage = `# scan\nnpx lathe init`\n")
    put('packages/core/compiler/src/diag.ts', "export const fix = 'Upgrade (`bunx pyreon upgrade`).'\n")
    expect(codes().sort()).toEqual([
      'packages/tools/cli/src/recipes.ts:2: `npx lathe` runs the npm package named "lathe", not @pyreon/lathe, when it is not installed locally.',
      'packages/core/compiler/src/diag.ts:1: `bunx pyreon` runs the npm package named "pyreon", not @pyreon/cli, when it is not installed locally.',
    ].sort())
  })

  it('ignores comments, code, tests, fixtures and type declarations', () => {
    put('packages/tools/cli/src/a.ts', '// npx lathe init\n/* bunx pyreon doctor */\nconst npx = 1; npx lathe\n')
    put('packages/tools/cli/src/tests/a.test.ts', "const s = 'npx lathe init'\n")
    put('packages/tools/cli/src/b.test.ts', "const s = 'npx lathe init'\n")
    put('packages/tools/cli/src/fixtures/c.ts', "const s = 'npx lathe init'\n")
    put('packages/tools/cli/src/d.d.ts', "declare const s: 'npx lathe init'\n")
    expect(codes()).toEqual([])
  })

  it('honours the narrow, reasoned allowance and nothing wider', () => {
    const scaffold = 'packages/zero/create-multiplatform/src/scaffold.ts'
    expect(RUNNER_COMMAND_ALLOWANCES.get(scaffold)?.reason).toMatch(/@pyreon\/native-cli/)
    put('packages/native/cli/package.json', JSON.stringify({ name: '@pyreon/native-cli', bin: { 'pyreon-native': 'bin/cli.js' } }))
    put(scaffold, 'const phase = `npx pyreon-native build --target=ios`\nconst other = `npx lathe init`\n')
    // The allowed bin in the allowed file passes; another bin there does not.
    expect(codes()).toEqual([
      `${scaffold}:2: \`npx lathe\` runs the npm package named "lathe", not @pyreon/lathe, when it is not installed locally.`,
    ])
    // The same allowed bin in any other file is reported.
    put('packages/zero/create-zero/src/x.ts', 'const s = `npx pyreon-native build`\n')
    expect(codes()).toContain(
      'packages/zero/create-zero/src/x.ts:1: `npx pyreon-native` runs the npm package named "pyreon-native", not @pyreon/native-cli, when it is not installed locally.',
    )
  })
})

describe('stringLiteralText', () => {
  it('keeps string and template text at the same offsets, blanks the rest', () => {
    const src = "a('x') // c\nb(`t ${f('in')} u`) /* d */ \"q\\\"r\""
    const out = stringLiteralText(src)
    expect(out).toHaveLength(src.length)
    expect(out.split('\n')).toHaveLength(2)
    expect(out.replace(/\s+/g, ' ').trim()).toBe('x t in u q\\"r')
  })
})
