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
import { getPreset, lint } from '@pyreon/lint'
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

  it('ships editor settings that format and fix on save', async () => {
    const dir = await scaffolded({})
    expect(JSON.parse(readFileSync(join(dir, '.vscode', 'extensions.json'), 'utf8')).recommendations).toEqual([
      'oxc.oxc-vscode',
    ])
    const settings = readFileSync(join(dir, '.vscode', 'settings.json'), 'utf8')
    expect(settings).toContain('"source.fixAll.pyreon": "explicit"')
    expect(settings).toContain('"editor.formatOnSave": true')
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
    for (const f of ['.pyreonlintrc.json', '.oxlintrc.json', 'oxfmt.config.ts', '.vscode/settings.json']) {
      expect(existsSync(join(dir, f)), f).toBe(false)
    }
  })
})

describe('a fresh project lints with ZERO findings — base rules and readable', () => {
  // What `bun run lint` (pyreon-lint half) reports on a new project: the whole
  // project root, with the scaffolded config. Every template, with all and no
  // features, with and without the integrations, and every adapter overlay.
  const ALL = Object.keys(FEATURES) as ProjectConfig['features']
  const variants: Array<[string, Partial<ProjectConfig>]> = []
  for (const template of ['app', 'blog', 'dashboard', 'monorepo'] as const) {
    for (const [fl, features] of [['all features', ALL], ['no features', []]] as const) {
      for (const [il, integrations] of [['both integrations', ['supabase', 'email']], ['no integrations', []]] as const) {
        variants.push([`${template}, ${fl}, ${il}`, { template, features: [...features], integrations: [...integrations] }])
      }
    }
  }
  for (const adapter of ['vercel', 'cloudflare', 'netlify', 'node', 'bun', 'static'] as const) {
    variants.push([`app, all features, ${adapter} adapter`, { template: 'app', features: [...ALL], adapter }])
  }

  for (const [label, overrides] of variants) {
    it(label, async () => {
      const dir = await scaffolded(overrides)
      const root = overrides.template === 'monorepo' ? join(dir, 'apps', 'web') : dir
      const result = lint({ paths: [dir], config: join(root, '.pyreonlintrc.json') })
      const findings = result.files.flatMap((f) =>
        f.diagnostics.map((d) => `${f.filePath.slice(dir.length)}:${d.loc.line} ${d.ruleId}`),
      )
      expect(findings).toEqual([])
      expect(result.configDiagnostics).toEqual([])
      // The run really linted the project, with the readable rules on.
      expect(result.files.length).toBeGreaterThan(3)
      expect(getPreset(['recommended', 'readable']).rules['pyreon/padding-before-return']).toBe('warn')
    })
  }
})
