/**
 * Dedicated tests for the opt-in, dependency-gated frontend rule
 * `pyreon/no-discarded-optimize-fields`.
 *
 * Fires only in projects that declare `@pyreon/zero`, on a raw `<img>`
 * whose `src` is `<optimizeImport>.src` (discarding the rest of the
 * `?optimize` descriptor). Builds real temp-dir fixtures with a
 * `package.json` so `isProjectDependency` resolves against it.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { LintConfig } from '../types'
import { noDiscardedOptimizeFields } from '../rules/frontend/no-discarded-optimize-fields'
import { lintFile } from '../runner'
import { _resetProjectDepsCache } from '../utils/project-deps'

const RULE = 'pyreon/no-discarded-optimize-fields'
const ON: LintConfig = { rules: { [RULE]: 'warn' } }

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-no-discarded-optimize-'))
  const real = fs.realpathSync(dir)
  tmpDirs.push(real)
  return real
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

/** Build a fixture project (default: declares @pyreon/zero) and return the src path. */
function makeProject(source: string, pkgJson: object = { name: 'app', dependencies: { '@pyreon/zero': '^1.0.0' } }): string {
  const dir = makeTmpDir()
  writeFile(dir, 'package.json', JSON.stringify(pkgJson))
  const srcPath = path.join(dir, 'src', 'App.tsx')
  writeFile(dir, 'src/App.tsx', source)
  return srcPath
}

function diagIds(srcPath: string, config: LintConfig = ON): string[] {
  const result = lintFile(srcPath, fs.readFileSync(srcPath, 'utf-8'), [noDiscardedOptimizeFields], config)
  return result.diagnostics.map((d) => d.ruleId)
}

beforeEach(() => {
  _resetProjectDepsCache()
})

afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true })
})

describe('pyreon/no-discarded-optimize-fields', () => {
  // ── FIRES ──────────────────────────────────────────────────────────────
  it('FIRES on <img src={hero.src}> where hero is a ?optimize import', () => {
    const src = makeProject(
      `import hero from './hero.png?optimize'\nexport default () => <img src={hero.src} alt="Hero" />`,
    )
    expect(diagIds(src)).toContain(RULE)
  })

  it('FIRES even when width/height are also passed (srcset/placeholder/formats still dropped)', () => {
    const src = makeProject(
      `import hero from './hero.jpg?optimize'\nexport default () => <img src={hero.src} width={hero.width} height={hero.height} alt="x" />`,
    )
    expect(diagIds(src)).toContain(RULE)
  })

  it('FIRES with a single-quote / extra-query ?optimize import', () => {
    const src = makeProject(
      `import pic from './a.avif?optimize&foo=1'\nexport default () => <img src={pic.src} alt="" />`,
    )
    expect(diagIds(src)).toContain(RULE)
  })

  // ── DOES NOT FIRE ──────────────────────────────────────────────────────
  it('does NOT fire when @pyreon/zero is not a dependency', () => {
    const src = makeProject(
      `import hero from './hero.png?optimize'\nexport default () => <img src={hero.src} alt="Hero" />`,
      { name: 'app', dependencies: { react: '^18.0.0' } },
    )
    expect(diagIds(src)).not.toContain(RULE)
  })

  it('does NOT fire on <OptimizedImage source={hero} /> (the recommended fix)', () => {
    const src = makeProject(
      `import hero from './hero.png?optimize'\nexport default () => <OptimizedImage source={hero} alt="Hero" />`,
    )
    expect(diagIds(src)).not.toContain(RULE)
  })

  it('does NOT fire on <Image {...hero} /> (spread form)', () => {
    const src = makeProject(
      `import hero from './hero.png?optimize'\nexport default () => <Image {...hero} alt="Hero" />`,
    )
    expect(diagIds(src)).not.toContain(RULE)
  })

  it('does NOT fire on a string-literal src', () => {
    const src = makeProject(`export default () => <img src="static.png" alt="x" />`)
    expect(diagIds(src)).not.toContain(RULE)
  })

  it('does NOT fire when the binding is NOT a ?optimize import', () => {
    const src = makeProject(
      `import hero from './hero.png'\nexport default () => <img src={hero.src} alt="x" />`,
    )
    expect(diagIds(src)).not.toContain(RULE)
  })

  it('does NOT fire on a non-`.src` member read', () => {
    const src = makeProject(
      `import hero from './hero.png?optimize'\nexport default () => <img src={hero.placeholder} alt="x" />`,
    )
    expect(diagIds(src)).not.toContain(RULE)
  })

  // ── OPT-IN ─────────────────────────────────────────────────────────────
  it('does NOT fire when the rule is disabled (opt-in default OFF)', () => {
    const src = makeProject(
      `import hero from './hero.png?optimize'\nexport default () => <img src={hero.src} alt="Hero" />`,
    )
    expect(diagIds(src, { rules: {} })).not.toContain(RULE)
  })
})
