/**
 * Dedicated tests for the opt-in, dependency-gated frontend rule
 * `pyreon/prefer-zero-image`.
 *
 * This rule only fires when the linted project declares a dependency
 * on `@pyreon/zero`. The tests build real temp dirs with a
 * `package.json` (one declaring `@pyreon/zero`, one not) and pass the
 * absolute source path to `lintFile` so `isProjectDependency` resolves
 * against the fixture manifest.
 *
 * `_resetProjectDepsCache()` runs in `beforeEach` to avoid the
 * manifest/deps memoization bleeding across fixtures.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { LintConfig } from '../types'
import { preferZeroImage } from '../rules/frontend/prefer-zero-image'
import { lintFile } from '../runner'
import { _resetProjectDepsCache } from '../utils/project-deps'

const ON: LintConfig = { rules: { 'pyreon/prefer-zero-image': 'info' } }

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-prefer-zero-image-'))
  // Canonicalize to match what node:path resolution will report
  // (macOS /var → /private/var symlink).
  const real = fs.realpathSync(dir)
  tmpDirs.push(real)
  return real
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

/** Builds a fixture project and returns the absolute source file path. */
function makeProject(pkgJson: object, source: string): string {
  const dir = makeTmpDir()
  writeFile(dir, 'package.json', JSON.stringify(pkgJson))
  const srcPath = path.join(dir, 'src', 'App.tsx')
  writeFile(dir, 'src/App.tsx', source)
  return srcPath
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

beforeEach(() => {
  _resetProjectDepsCache()
})

afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true })
})

describe('pyreon/prefer-zero-image (dedicated)', () => {
  // ── FIRES (project depends on @pyreon/zero) ──────────────────────────────
  it('FIRES on raw <img src=...> when the project depends on @pyreon/zero', () => {
    const srcPath = makeProject(
      { name: 'app', dependencies: { '@pyreon/zero': '^1.0.0' } },
      `export default () => <img src="hero.png" alt="hero" />`,
    )
    const result = lintFile(srcPath, fs.readFileSync(srcPath, 'utf-8'), [preferZeroImage], ON)
    expect(diagIds(result)).toContain('pyreon/prefer-zero-image')
  })

  it('FIRES when @pyreon/zero is declared in devDependencies', () => {
    const srcPath = makeProject(
      { name: 'app', devDependencies: { '@pyreon/zero': '^1.0.0' } },
      `export default () => <main><img src="a.png" alt="a" /></main>`,
    )
    const result = lintFile(srcPath, fs.readFileSync(srcPath, 'utf-8'), [preferZeroImage], ON)
    expect(diagIds(result)).toContain('pyreon/prefer-zero-image')
  })

  // ── DOES NOT FIRE (dependency absent) ────────────────────────────────────
  it('does NOT fire when @pyreon/zero is NOT a project dependency (even if rule enabled)', () => {
    const srcPath = makeProject(
      { name: 'app', dependencies: { react: '^18.0.0' } },
      `export default () => <img src="hero.png" alt="hero" />`,
    )
    const result = lintFile(srcPath, fs.readFileSync(srcPath, 'utf-8'), [preferZeroImage], ON)
    expect(diagIds(result)).not.toContain('pyreon/prefer-zero-image')
  })

  it('does NOT fire on <Image> (already the optimized component)', () => {
    const srcPath = makeProject(
      { name: 'app', dependencies: { '@pyreon/zero': '^1.0.0' } },
      `export default () => <Image src="hero.png" alt="hero" />`,
    )
    const result = lintFile(srcPath, fs.readFileSync(srcPath, 'utf-8'), [preferZeroImage], ON)
    expect(diagIds(result)).not.toContain('pyreon/prefer-zero-image')
  })

  it('does NOT fire on a bare <img> with no src', () => {
    const srcPath = makeProject(
      { name: 'app', dependencies: { '@pyreon/zero': '^1.0.0' } },
      `export default () => <img alt="" />`,
    )
    const result = lintFile(srcPath, fs.readFileSync(srcPath, 'utf-8'), [preferZeroImage], ON)
    expect(diagIds(result)).not.toContain('pyreon/prefer-zero-image')
  })

  // ── OPT-IN BEHAVIOUR ─────────────────────────────────────────────────────
  it('does NOT fire when the rule is not enabled (opt-in default OFF), even with the dep', () => {
    const srcPath = makeProject(
      { name: 'app', dependencies: { '@pyreon/zero': '^1.0.0' } },
      `export default () => <img src="hero.png" alt="hero" />`,
    )
    const result = lintFile(srcPath, fs.readFileSync(srcPath, 'utf-8'), [preferZeroImage], {
      rules: {},
    })
    expect(diagIds(result)).not.toContain('pyreon/prefer-zero-image')
  })

  // ── exemptPaths ──────────────────────────────────────────────────────────
  it('does NOT fire for an exempt path even with the dep + rule enabled', () => {
    const dir = makeTmpDir()
    writeFile(
      dir,
      'package.json',
      JSON.stringify({ name: 'app', dependencies: { '@pyreon/zero': '^1.0.0' } }),
    )
    const srcPath = path.join(dir, 'src', 'legacy', 'Old.tsx')
    writeFile(dir, 'src/legacy/Old.tsx', `export default () => <img src="x.png" alt="x" />`)
    const result = lintFile(srcPath, fs.readFileSync(srcPath, 'utf-8'), [preferZeroImage], {
      rules: {
        'pyreon/prefer-zero-image': ['info', { exemptPaths: ['src/legacy/'] }],
      },
    })
    expect(diagIds(result)).not.toContain('pyreon/prefer-zero-image')
  })
})
