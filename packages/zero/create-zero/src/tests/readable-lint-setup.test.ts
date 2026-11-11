/**
 * A lint-enabled scaffold ships the READABLE setup — and its own code passes it.
 *
 * Three tools, three files: `.pyreonlintrc.json` (the `readable` layer plus
 * block padding, so a new project gets "spacing between code parts" from day
 * one), `.oxlintrc.json` (extends `@pyreon/lint/oxlint/readable.json` for the
 * size limits) and `oxfmt.config.ts` (re-exports `@pyreon/lint/oxfmt`).
 *
 * The clean-template test runs the REAL `lint()` with the scaffolded config
 * over every template, with every feature and both integrations on, so a
 * template edit that breaks the preset fails here rather than in a user's
 * first `bun run lint`.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { allRules, getPreset, groupOf, lint } from '@pyreon/lint'
import { afterAll, describe, expect, it } from 'vitest'
import { generatePackageJson, OXFMT_RANGE, OXLINT_RANGE } from '../generators/package-json'
import { scaffold } from '../scaffold'
import { FEATURES, type ProjectConfig } from '../templates'

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

function config(overrides: Partial<ProjectConfig>): ProjectConfig {
  return {
    name: 'demo',
    targetDir: '',
    template: 'app',
    renderMode: 'ssr-stream',
    adapter: 'vercel',
    features: [],
    packageStrategy: 'meta',
    integrations: [],
    aiTools: [],
    compat: 'none',
    lint: true,
    typedRoutes: false,
    ...overrides,
  }
}

async function scaffolded(overrides: Partial<ProjectConfig>): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'cz-readable-'))
  dirs.push(dir)
  await scaffold(config({ ...overrides, targetDir: dir }))
  return dir
}

const STYLE = new Set(allRules.filter((r) => groupOf(r.meta) === 'style').map((r) => r.meta.id))
const LINT_PKG = join(import.meta.dirname, '..', '..', '..', '..', 'tools', 'lint')

describe('the scaffolded readable setup', () => {
  it('turns on the readable layer plus block padding', async () => {
    const dir = await scaffolded({})
    const rc = JSON.parse(readFileSync(join(dir, '.pyreonlintrc.json'), 'utf8'))
    expect(rc.preset).toEqual(['recommended', 'readable'])
    expect(rc.rules['pyreon/padding-around-multiline-blocks']).toBe('warn')
    // …and that config really enables the spacing rules.
    const preset = getPreset(rc.preset)
    for (const id of ['pyreon/padding-between-declarations', 'pyreon/padding-before-return', 'pyreon/padding-between-component-sections']) {
      expect(preset.rules[id], id).toBe('warn')
    }
  })

  it('extends the shipped oxlint preset by a path that exists in @pyreon/lint', async () => {
    const dir = await scaffolded({})
    const rc = JSON.parse(readFileSync(join(dir, '.oxlintrc.json'), 'utf8'))
    expect(rc.extends).toEqual(['./node_modules/@pyreon/lint/oxlint/readable.json'])
    expect(existsSync(join(LINT_PKG, 'oxlint', 'readable.json'))).toBe(true)
    const pkg = JSON.parse(readFileSync(join(LINT_PKG, 'package.json'), 'utf8'))
    expect(pkg.files).toContain('oxlint')
  })

  it('re-exports the shipped oxfmt preset, which the package exports', async () => {
    const dir = await scaffolded({})
    expect(readFileSync(join(dir, 'oxfmt.config.ts'), 'utf8')).toContain(
      "export { readableStrict as default } from '@pyreon/lint/oxfmt'",
    )
    const pkg = JSON.parse(readFileSync(join(LINT_PKG, 'package.json'), 'utf8'))
    expect(pkg.exports['./oxfmt'].import).toBe('./lib/oxfmt.js')
  })

  it('adds the tools and the lint / format / fix scripts only when lint is on', () => {
    const on = JSON.parse(generatePackageJson(config({ lint: true })))
    expect(on.devDependencies).toMatchObject({ oxlint: OXLINT_RANGE, oxfmt: OXFMT_RANGE })
    expect(on.scripts).toMatchObject({
      lint: 'oxlint && pyreon-lint .',
      format: 'oxfmt',
      fix: 'oxfmt && oxlint --fix && pyreon-lint --fix .',
    })
    const off = JSON.parse(generatePackageJson(config({ lint: false })))
    expect(off.devDependencies.oxlint).toBeUndefined()
    expect(off.scripts.lint).toBeUndefined()
    expect(off.scripts.fix).toBeUndefined()
  })

  it('writes no lint files when lint is off', async () => {
    const dir = await scaffolded({ lint: false })
    for (const f of ['.pyreonlintrc.json', '.oxlintrc.json', 'oxfmt.config.ts']) {
      expect(existsSync(join(dir, f)), f).toBe(false)
    }
  })
})

describe('every template is clean under the readable preset', () => {
  const ALL = Object.keys(FEATURES) as ProjectConfig['features']
  for (const template of ['app', 'blog', 'dashboard', 'monorepo'] as const) {
    for (const [label, features] of [['all features', ALL], ['no features', []]] as const) {
      it(`${template}, ${label}, both integrations`, async () => {
        const dir = await scaffolded({ template, features: [...features], integrations: ['supabase', 'email'] })
        const root = template === 'monorepo' ? join(dir, 'apps', 'web') : dir
        const paths = template === 'monorepo' ? [join(dir, 'apps'), join(dir, 'packages')] : [join(root, 'src')]
        const result = lint({ paths, config: join(root, '.pyreonlintrc.json') })
        const style = result.files.flatMap((f) =>
          f.diagnostics.filter((d) => STYLE.has(d.ruleId)).map((d) => `${f.filePath.slice(dir.length)}:${d.loc.line} ${d.ruleId}`),
        )
        expect(style).toEqual([])
        // The run really linted something, with the readable rules on.
        expect(result.files.length).toBeGreaterThan(3)
      })
    }
  }
})
