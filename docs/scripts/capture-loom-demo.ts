/**
 * Captures the real Loom report the /products/loom demo renders.
 *
 *   bun docs/scripts/capture-loom-demo.ts
 *
 * Writes a small sample workspace (`@acme/*`, fourteen packages) to a TEMP
 * directory — never into the tree, where its package.json files would join
 * the repo's own workspace globs — runs the real `loom scan --json` on it,
 * and writes the report to `docs/src/site/demos/_capture-loom.ts`. Every
 * finding, edge, depth and reach the demo shows is Loom's own answer for
 * these manifests and imports. The workspace contains one honest instance
 * of each issue class:
 *
 *   - runtime cycle: forms → validation → i18n → forms
 *   - phantom dependency: ui imports `clsx` without declaring it
 *   - phantom type dependency: http `import type`s from `undici`
 *   - version drift: `zod` ^3.23 (query) vs ^3.22 (auth); `vite` ^5.4 (docs) vs ^6.0
 *   - prod import of a dev dependency: docs imports @acme/test-utils at runtime
 *   - peer mismatch: dashboard peers @acme/ui ^1, the workspace copy is 2.0.0
 *   - unused declarations: lodash-es (ui), d3-array (charts), dayjs (web), happy-dom (test-utils)
 *
 * Not `loom build` + an iframe (as the Atlas demo does): `loom build --base`
 * does not forward the base to zero, so the observatory cannot be served from
 * a sub-path (reported to the coordinator; see the slice report).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const target = join(root, 'docs/src/site/demos/_capture-loom.ts')
const ws = mkdtempSync(join(tmpdir(), 'loom-demo-'))

type Pkg = {
  version?: string
  private?: boolean
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  /** src/index.ts */
  source: string
}

const W = 'workspace:*'
const PACKAGES: Record<string, Pkg> = {
  core: { source: `export const VERSION = '1.0.0'\nexport function id<T>(value: T): T {\n  return value\n}\n` },
  tokens: { source: `export const space = [0, 4, 8, 12, 16, 24, 32] as const\n` },
  http: {
    dependencies: { '@acme/core': W },
    source: `import type { Dispatcher } from 'undici'\nimport { id } from '@acme/core'\n\nexport type Agent = Dispatcher\nexport const get = (url: string) => fetch(id(url))\n`,
  },
  i18n: {
    dependencies: { '@acme/core': W, '@acme/forms': W },
    source: `import { id } from '@acme/core'\nimport { fieldLabel } from '@acme/forms'\n\nexport const t = (key: string) => id(fieldLabel(key))\n`,
  },
  ui: {
    version: '2.0.0',
    dependencies: { '@acme/core': W, '@acme/tokens': W, 'lodash-es': '^4.17.21' },
    source: `import clsx from 'clsx'\nimport { id } from '@acme/core'\nimport { space } from '@acme/tokens'\n\nexport const cx = (...parts: string[]) => id(clsx(parts))\nexport const gap = space[2]\n`,
  },
  validation: {
    dependencies: { '@acme/i18n': W, '@acme/core': W },
    source: `import { id } from '@acme/core'\nimport { t } from '@acme/i18n'\n\nexport const required = (value: string) => (id(value) ? null : t('required'))\n`,
  },
  query: {
    dependencies: { '@acme/http': W, zod: '^3.23.0' },
    source: `import { z } from 'zod'\nimport { get } from '@acme/http'\n\nexport const Todo = z.object({ id: z.number() })\nexport const load = () => get('/todos')\n`,
  },
  charts: {
    dependencies: { '@acme/ui': W, 'd3-array': '^3.2.4' },
    source: `import { cx } from '@acme/ui'\n\nexport const chartClass = cx('chart')\n`,
  },
  forms: {
    dependencies: { '@acme/validation': W, '@acme/ui': W },
    source: `import { cx } from '@acme/ui'\nimport { required } from '@acme/validation'\n\nexport const fieldLabel = (key: string) => key\nexport const check = (value: string) => [cx('field'), required(value)]\n`,
  },
  auth: {
    dependencies: { '@acme/query': W, '@acme/ui': W, zod: '^3.22.0' },
    source: `import { z } from 'zod'\nimport { load } from '@acme/query'\nimport { cx } from '@acme/ui'\n\nexport const Session = z.object({ user: z.string() })\nexport const signIn = () => [load(), cx('auth')]\n`,
  },
  dashboard: {
    private: true,
    dependencies: { '@acme/forms': W, '@acme/auth': W, '@acme/charts': W },
    peerDependencies: { '@acme/ui': '^1.0.0' },
    devDependencies: { vite: '^6.0.0' },
    source: `import { signIn } from '@acme/auth'\nimport { chartClass } from '@acme/charts'\nimport { check } from '@acme/forms'\n\nexport const boot = () => [signIn(), chartClass, check('')]\n`,
  },
  web: {
    private: true,
    dependencies: { '@acme/dashboard': W, '@acme/auth': W, dayjs: '^1.11.13' },
    devDependencies: { vite: '^6.0.0' },
    source: `import { signIn } from '@acme/auth'\nimport { boot } from '@acme/dashboard'\n\nboot()\nsignIn()\n`,
  },
  docs: {
    private: true,
    dependencies: { '@acme/ui': W, '@acme/charts': W },
    devDependencies: { '@acme/test-utils': W, vite: '^5.4.0' },
    source: `import { chartClass } from '@acme/charts'\nimport { renderPage } from '@acme/test-utils'\nimport { cx } from '@acme/ui'\n\nexport const page = renderPage(cx(chartClass))\n`,
  },
  'test-utils': {
    private: true,
    dependencies: { '@acme/core': W, 'happy-dom': '^15.11.0' },
    source: `import { id } from '@acme/core'\n\nexport const renderPage = (html: string) => id(html)\n`,
  },
}

const json = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
json(join(ws, 'package.json'), { name: 'acme', private: true, workspaces: ['packages/*'] })
for (const [dir, p] of Object.entries(PACKAGES)) {
  const abs = join(ws, 'packages', dir)
  mkdirSync(join(abs, 'src'), { recursive: true })
  const { source, ...fields } = p
  json(join(abs, 'package.json'), {
    name: `@acme/${dir}`,
    version: fields.version ?? '1.0.0',
    ...(fields.private ? { private: true } : {}),
    type: 'module',
    exports: { '.': './src/index.ts' },
    ...(fields.dependencies ? { dependencies: fields.dependencies } : {}),
    ...(fields.peerDependencies ? { peerDependencies: fields.peerDependencies } : {}),
    ...(fields.devDependencies ? { devDependencies: fields.devDependencies } : {}),
  })
  writeFileSync(join(abs, 'src/index.ts'), source)
}

const loom = join(root, 'packages/tools/loom/bin/loom.js')
const scan = spawnSync('bun', [loom, 'scan', ws, '--json', '--no-write'], { cwd: ws, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
rmSync(ws, { recursive: true, force: true })
if (scan.status !== 0 && !scan.stdout.trim().startsWith('{')) {
  throw new Error(`[Pyreon] loom scan failed (exit ${scan.status}): ${scan.stderr}`)
}
// The temp path is replaced with a stable label so re-runs diff cleanly.
const report = JSON.parse(scan.stdout.split(ws).join('<workspace>')) as { model: { root: { dir: string } } }
report.model.root.dir = '<workspace>'
const date = new Date().toISOString().slice(0, 10)
const out = `/**
 * The real \`loom scan --json\` report of the sample @acme workspace, for
 * DemoLoom.tsx. Generated by docs/scripts/capture-loom-demo.ts on ${date}
 * (the script holds the workspace's manifests and sources). Do not edit.
 */
export interface LoomCapture {
  model: { packages: { name: string; version: string; private: boolean; deps: { name: string; range: string; field: string }[] }[] }
  graph: { cycles: string[][]; reach: Record<string, number>; edges: string[][] }
  issues: { code: string; severity: string; pkg: string; dep?: string; message: string }[]
  stats: { internal: number; external: number; edges: number; cycles: number; errors: number; warnings: number; infos: number }
}

export const LOOM_CAPTURED = ${JSON.stringify(date)}

const DATA = ${JSON.stringify(report)}

export const LOOM_REPORT: LoomCapture = DATA
`
writeFileSync(target, out)
process.stdout.write(`loom report → ${target}\n`)
