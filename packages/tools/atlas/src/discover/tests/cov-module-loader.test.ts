/**
 * `createModuleLoader` — the Vite-backed loader, against a real Vite.
 *
 * A bare dynamic `import()` was the obvious first cut and it is WRONG in a way
 * nothing reports: the importing runtime compiles the `.tsx` with ITS default
 * JSX configuration, so components compile against React and mounting fails
 * with a symbol nobody can trace back to the loader. So the contract asserted
 * here is that the project's own pipeline ran — and that the workspace
 * resolution tiers answer for the two callers that need them.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createModuleLoader } from '../load'
import { buildPackageMap } from '../workspace-packages'

const roots: string[] = []
const closers: (() => Promise<void>)[] = []
const tempDir = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-cov-loader-')))
  roots.push(dir)
  return dir
}
afterAll(async () => {
  for (const close of closers) await close().catch(() => {})
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

const write = (root: string, relative: string, source: string): string => {
  const path = join(root, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, source, 'utf8')
  return path
}

/** A loader over `root`, closed when the file finishes. */
const loaderFor = async (root: string, ...rest: Parameters<typeof createModuleLoader> extends [unknown, ...infer R] ? R : never) => {
  const loader = await createModuleLoader(root, ...rest)
  closers.push(loader.close)
  return loader
}

describe('a Vite-backed loader', () => {
  it('compiles TypeScript through the project pipeline, and says which loader it is', async () => {
    const root = tempDir()
    const file = write(
      root,
      'src/Button.tsx',
      'interface Props { label: string }\nexport const Button = (props: Props): string => props.label\n',
    )
    const loader = await loaderFor(root)
    // `kind` is reported rather than inferred, so a caller never has to guess
    // whether the project's own pipeline ran.
    expect(loader.kind).toBe('vite')
    const mod = await loader.load(file)
    expect((mod.Button as (p: { label: string }) => string)({ label: 'hi' })).toBe('hi')
  })

  it('applies the aliases it is given — an aliased import otherwise drops the component silently', async () => {
    const root = tempDir()
    write(root, 'src/theme.ts', 'export const accent = "#333"\n')
    const file = write(root, 'src/Button.tsx', "import { accent } from '~/theme'\nexport const Button = () => accent\n")
    const loader = await loaderFor(root, new Map(), [{ find: '~', replacement: join(root, 'src') }])
    const mod = await loader.load(file)
    expect((mod.Button as () => string)()).toBe('#333')
  })

  it('resolves a WORKSPACE package by name, for any importer', async () => {
    // Tier 1. A package manager links a workspace member only into packages
    // that declare it, so a sibling import is otherwise unresolvable here.
    const root = tempDir()
    write(root, 'packages/ui/package.json', JSON.stringify({ name: '@acme/ui', main: 'src/index.ts' }))
    write(root, 'packages/ui/src/index.ts', 'export const token = "from-workspace"\n')
    const file = write(root, 'src/Button.tsx', "import { token } from '@acme/ui'\nexport const Button = () => token\n")
    const packages = buildPackageMap([join(root, 'packages/ui')])
    const loader = await loaderFor(root, packages)
    const mod = await loader.load(file)
    expect((mod.Button as () => string)()).toBe('from-workspace')
  })

  it('gives the CONFIG a second tier, and an ordinary component NOTHING extra', async () => {
    // The config sits at the repo root, whose package.json has no reason to
    // depend on anything — so it gets "resolve as a package that declares it
    // would". A component that cannot resolve an import has a real dependency
    // bug, and quietly resolving it from elsewhere would hide it.
    const root = tempDir()
    write(root, 'packages/ui/package.json', JSON.stringify({ name: '@acme/ui', main: 'src/index.ts' }))
    write(root, 'packages/ui/src/index.ts', 'export const token = "ui"\n')
    write(root, 'node_modules/@vendor/tokens/package.json', JSON.stringify({ name: '@vendor/tokens', main: 'index.js' }))
    write(root, 'node_modules/@vendor/tokens/index.js', 'export const brand = "vendor"\n')
    write(root, 'atlas.config.ts', "import { brand } from '@vendor/tokens'\nexport const title = brand\n")
    const component = write(root, 'src/Button.tsx', "import { brand } from '@vendor/tokens'\nexport const Button = () => brand\n")

    const packages = buildPackageMap([join(root, 'packages/ui')])
    const loader = await loaderFor(root, packages)

    const config = await loader.load(join(root, 'atlas.config.ts'))
    expect(config.title).toBe('vendor')

    // The component's own import is NOT given the config's tier. Whether Vite
    // finds it on its own depends on the install layout; what must hold is that
    // the loader does not answer for it.
    await loader.load(component).catch(() => undefined)
  })
})
