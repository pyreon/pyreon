/**
 * Scaffold matrix — "test all possible scenarios". For every combination of
 * template × renderMode × adapter × preset (plus compat / packageStrategy /
 * integrations / aiTools sweeps), the scaffolder must produce a project whose
 * every `package.json`:
 *   - is valid JSON,
 *   - has no `undefined` / empty dependency values, and
 *   - never leaks a `workspace:` range into an `@pyreon/*` dep (those resolve
 *     to a published range; a leak breaks `npm install` in the scaffolded app).
 *
 * This is the coverage `--yes` (defaults-only) could never give: the 0.33.0
 * custom-features crash + the broken `full` preset both lived in paths the
 * defaults never touched. The `full` preset here exercises EVERY feature
 * (including state-tree / coolgrid).
 */
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scaffold } from '../scaffold'
import { PRESETS, type ProjectConfig } from '../templates'

const TEMPLATES = ['app', 'blog', 'dashboard', 'monorepo'] as const
const MODES = ['ssr-stream', 'ssr-string', 'ssg', 'spa'] as const
const ADAPTERS = ['vercel', 'cloudflare', 'netlify', 'node', 'bun', 'static'] as const
const PRESET_IDS = ['minimal', 'standard', 'dashboard', 'full'] as const
const COMPATS = ['none', 'react', 'vue', 'solid', 'preact'] as const

function base(o: Partial<ProjectConfig>): ProjectConfig {
  return {
    name: 'm',
    targetDir: '',
    template: 'app',
    renderMode: 'ssr-stream',
    adapter: 'vercel',
    features: [],
    packageStrategy: 'meta',
    integrations: [],
    aiTools: ['mcp', 'claude'],
    compat: 'none',
    lint: true,
    ...o,
  }
}

const PKG_REL = [
  'package.json',
  'apps/web/package.json',
  'packages/ui/package.json',
  'packages/types/package.json',
]

async function assertValidScaffold(
  label: string,
  cfg: Partial<ProjectConfig>,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'cz-matrix-'))
  try {
    await scaffold(base({ ...cfg, targetDir: dir }))
    const pkgs = PKG_REL.map((p) => join(dir, p)).filter(existsSync)
    expect(pkgs.length, `${label}: at least one package.json`).toBeGreaterThan(0)
    for (const pp of pkgs) {
      const rel = pp.slice(dir.length)
      let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
      try {
        pkg = JSON.parse(readFileSync(pp, 'utf8'))
      } catch (e) {
        throw new Error(`${label}: ${rel} is not valid JSON: ${(e as Error).message}`)
      }
      for (const field of ['dependencies', 'devDependencies'] as const) {
        for (const [name, range] of Object.entries(pkg[field] ?? {})) {
          if (typeof range !== 'string' || range === '' || range.includes('undefined')) {
            throw new Error(`${label}: ${rel} bad dep ${name}=${JSON.stringify(range)}`)
          }
          if (name.startsWith('@pyreon/') && range.startsWith('workspace:')) {
            throw new Error(`${label}: ${rel} leaked workspace: range for ${name}`)
          }
        }
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('scaffold matrix — template × mode × adapter, per preset', () => {
  for (const preset of PRESET_IDS) {
    it(
      `preset="${preset}" across all templates × modes × adapters`,
      async () => {
        for (const template of TEMPLATES) {
          for (const renderMode of MODES) {
            for (const adapter of ADAPTERS) {
              await assertValidScaffold(`${template}/${renderMode}/${adapter}/${preset}`, {
                template,
                renderMode,
                adapter,
                features: [...PRESETS[preset].features],
              })
            }
          }
        }
      },
      60_000,
    )
  }
})

describe('scaffold matrix — other dimensions', () => {
  it('compat mode × every template', async () => {
    for (const template of TEMPLATES) {
      for (const compat of COMPATS) {
        await assertValidScaffold(`${template}/compat=${compat}`, { template, compat })
      }
    }
  }, 30_000)

  it('packageStrategy (meta + individual) × every template, full features', async () => {
    for (const template of TEMPLATES) {
      for (const packageStrategy of ['meta', 'individual'] as const) {
        await assertValidScaffold(`${template}/pkg=${packageStrategy}`, {
          template,
          packageStrategy,
          features: [...PRESETS.full.features],
        })
      }
    }
  }, 30_000)

  it('every integration combination', async () => {
    const combos: ReadonlyArray<ReadonlyArray<'supabase' | 'email'>> = [
      [],
      ['supabase'],
      ['email'],
      ['supabase', 'email'],
    ]
    for (const integrations of combos) {
      await assertValidScaffold(`app/int=${integrations.join('+') || 'none'}`, {
        integrations: [...integrations],
      })
    }
  })

  it('every aiTools combination + lint on/off', async () => {
    const aiCombos = [
      [],
      ['mcp'],
      ['claude', 'cursor', 'copilot', 'agents'],
    ] as const
    for (const aiTools of aiCombos) {
      for (const lint of [true, false]) {
        await assertValidScaffold(`app/ai=${aiTools.join('+') || 'none'}/lint=${lint}`, {
          aiTools: [...aiTools] as ProjectConfig['aiTools'],
          lint,
        })
      }
    }
  })
})
