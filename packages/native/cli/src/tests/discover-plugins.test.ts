import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCompiler } from '@pyreon/native-compiler'
import {
  collectImportSpecifiers,
  discoverPlugins,
  isActivated,
  listPluginPackages,
} from '../discover-plugins'
import { explainReport, pluginsReport } from '../plugin-commands'
import { mainWithPlugins } from '../cli'

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '../../bin/pyreon-native.js')
const MARKERS = '__pyreonDiscoverMarkers'
const g = globalThis as unknown as Record<string, string[] | undefined>

const BADGE_SOURCE = "import { Badge } from '@acme/badge'\nexport function Example() { return <ReleaseBadge /> }"
const pluginModule = (name: string, body = '') => `
(globalThis.${MARKERS} ??= []).push(${JSON.stringify(name)})
export default { name: ${JSON.stringify(name)}, apiVersion: 1, ${body} }`
const BADGE_BODY = `transformIR(module) {
  for (const c of module.components)
    if (c.returnExpr.kind === 'jsx-element' && c.returnExpr.tag === 'ReleaseBadge')
      c.returnExpr = { kind: 'jsx-element', tag: 'Text', attrs: [], children: [{ kind: 'text', value: 'From package plugin' }] }
}`

let root: string
let app: string
function addPackage(name: string, manifest: Record<string, unknown>, plugin?: string, file = 'native/plugin.mjs') {
  const dir = join(app, 'node_modules', ...name.split('/'))
  mkdirSync(join(dir, 'native'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.2.3', ...manifest }))
  if (plugin !== undefined) writeFileSync(join(dir, file), plugin)
}
function setApp(deps: string[], source: string) {
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify({ name: 'app', dependencies: Object.fromEntries(deps.map((d) => [d, '1'])) }),
  )
  mkdirSync(join(app, 'src'), { recursive: true })
  writeFileSync(join(app, 'src', 'Example.tsx'), source)
}
const declares = (extra: Record<string, unknown> = {}) => ({
  pyreon: { native: { plugin: 'native/plugin.mjs', ...extra } },
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-native-discover-'))
  app = join(root, 'app')
  mkdirSync(app)
  g[MARKERS] = []
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('listPluginPackages', () => {
  it('lists only dependencies that declare a plugin; modules default to the package name', () => {
    addPackage('@acme/badge', declares(), pluginModule('badge'))
    addPackage('@acme/plain', {})
    addPackage('@acme/multi', declares({ modules: ['@acme/multi', 'multi-extras'] }), pluginModule('multi'))
    setApp(['@acme/badge', '@acme/plain', '@acme/multi', '@acme/absent'], BADGE_SOURCE)
    const found = listPluginPackages(app)
    expect(found.map((p) => [p.package, p.version, p.modules])).toEqual([
      ['@acme/badge', '1.2.3', ['@acme/badge']],
      ['@acme/multi', '1.2.3', ['@acme/multi', 'multi-extras']],
    ])
    expect(found[0]!.file).toBe(join(app, 'node_modules', '@acme', 'badge', 'native', 'plugin.mjs'))
  })

  it('resolves a hoisted dependency from a parent node_modules', () => {
    const hoisted = join(root, 'node_modules', '@acme', 'badge')
    mkdirSync(join(hoisted, 'native'), { recursive: true })
    writeFileSync(join(hoisted, 'package.json'), JSON.stringify({ name: '@acme/badge', ...declares() }))
    setApp(['@acme/badge'], BADGE_SOURCE)
    expect(listPluginPackages(app).map((p) => p.package)).toEqual(['@acme/badge'])
  })
})

describe('import scanning', () => {
  it('reads every import form', () => {
    const found = collectImportSpecifiers(
      `import a from 'one'; import 'two'; export * from "three"; const x = await import('four'); require('five')`,
    )
    expect([...found].sort()).toEqual(['five', 'four', 'one', 'three', 'two'])
  })

  it('matches the module exactly or as a subpath, never as a longer name', () => {
    expect(isActivated(['@acme/a'], new Set(['@acme/a/sub']))).toBe(true)
    expect(isActivated(['@acme/a'], new Set(['@acme/a']))).toBe(true)
    expect(isActivated(['@acme/a'], new Set(['@acme/ab']))).toBe(false)
  })
})

describe('lazy activation', () => {
  it('does NOT load a plugin whose module the source never imports', async () => {
    addPackage('@acme/badge', declares(), pluginModule('badge'))
    setApp(['@acme/badge'], 'export function Example() { return <Text>hi</Text> }')
    expect(await discoverPlugins(app, join(app, 'src'))).toEqual([])
    expect(g[MARKERS]).toEqual([])
  })

  it('loads it when the source imports the package (or a subpath of it)', async () => {
    addPackage('@acme/badge', declares(), pluginModule('badge'))
    setApp(['@acme/badge'], "import '@acme/badge/extra'\nexport function Example() { return <Text>hi</Text> }")
    const found = await discoverPlugins(app, join(app, 'src'))
    expect(found.map((f) => f.plugin.name)).toEqual(['badge'])
    expect(g[MARKERS]).toEqual(['badge'])
  })

  it('without a source (a listing) loads every declared plugin', async () => {
    addPackage('@acme/badge', declares(), pluginModule('badge'))
    setApp(['@acme/badge'], 'export function Example() { return <Text>hi</Text> }')
    expect((await discoverPlugins(app)).length).toBe(1)
  })
})

describe('plugin validation errors name the package and file', () => {
  it.each([
    ['a missing file', undefined, /does not exist/],
    ['a module that throws', 'throw new Error("boom")', /failed to load: boom/],
    ['no default export', 'export const x = 1', /must be an object/],
    ['an unsupported apiVersion', 'export default { name: "p", apiVersion: 9 }', /requires API 9; this compiler supports API 1/],
    ['bad services', 'export default { name: "p", apiVersion: 1, services: [] }', /services must be an object/],
  ])('%s', async (_label, body, message) => {
    addPackage('@acme/bad', declares(), body)
    setApp(['@acme/bad'], "import '@acme/bad'")
    const run = discoverPlugins(app, join(app, 'src'))
    await expect(run).rejects.toThrow(/package "@acme\/bad" \(.*plugin\.mjs\)/)
    await expect(run).rejects.toThrow(message)
  })
})

describe('conflicts', () => {
  const claim = (name: string) =>
    pluginModule(name, `services: { useThing: { swift: 'PyreonThing()', kotlin: ['val {id} = remember { PyreonThing() }'] } }`)

  it('two packages claiming one hook is a load-time error naming both owners', async () => {
    addPackage('@acme/one', declares(), claim('one'))
    addPackage('@acme/two', declares(), claim('two'))
    setApp(['@acme/one', '@acme/two'], "import '@acme/one'\nimport '@acme/two'")
    const found = await discoverPlugins(app, join(app, 'src'))
    expect(() => createCompiler({ discovered: found.map((f) => f.plugin) })).toThrow(
      /hook "useThing" is claimed by both "one" and "two"/,
    )
    const report = await pluginsReport(app, false)
    expect(report.exitCode).toBe(2)
    expect(report.lines.join('\n')).toContain('claimed by both "one" and "two"')
  })
})

describe('mainWithPlugins discovery', () => {
  const build = (...extra: string[]) =>
    mainWithPlugins(['build', '--target=ios', `--source=${join(app, 'src')}`, `--out=${join(root, 'out')}`, `--app=${app}`, ...extra])
  const emitted = () => readFileSync(join(root, 'out', 'Example.swift'), 'utf8')

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    addPackage('@acme/badge', declares(), pluginModule('badge', BADGE_BODY))
    setApp(['@acme/badge'], BADGE_SOURCE)
  })

  it('applies a discovered plugin to build', async () => {
    expect(await build()).toBe(0)
    expect(emitted()).toContain('From package plugin')
  })

  it('--no-plugins skips discovery entirely (and never loads the module)', async () => {
    g[MARKERS] = []
    const code = await build('--no-plugins')
    expect(g[MARKERS]).toEqual([])
    expect(code === 0 ? emitted() : '').not.toContain('From package plugin')
  })

  it('applies to check too, and a source that never imports the package is left alone', async () => {
    writeFileSync(join(app, 'src', 'Example.tsx'), 'export function Example() { return <ReleaseBadge /> }')
    g[MARKERS] = []
    await build()
    expect(g[MARKERS]).toEqual([])
  })
})

describe('plugins and explain reports', () => {
  it('lists built-ins, the registry owners and discovered plugins', async () => {
    addPackage(
      '@acme/badge',
      declares(),
      pluginModule('badge', "services: { useBadge: { swift: 'PyreonBadge()', kotlin: ['val {id} = remember { PyreonBadge() }'] } }"),
    )
    setApp(['@acme/badge'], "import '@acme/badge'")
    const { lines, exitCode } = await pluginsReport(app, false)
    expect(exitCode).toBe(0)
    expect(lines).toContain('  @pyreon/charts')
    expect(lines).toContain('  useShare  @pyreon/hooks')
    expect(lines).toContain('  useBadge  badge')
    expect(lines).toContain('  badge  @acme/badge@1.2.3  services: useBadge')
  })

  it('--verify fails on a service whose type the package does not ship, and passes when it does', async () => {
    const services = "services: { useBadge: { swift: 'PyreonBadge()', kotlin: ['val {id} = remember { PyreonBadge() }'] } }"
    addPackage('@acme/badge', declares(), pluginModule('badge', services))
    setApp(['@acme/badge'], "import '@acme/badge'")
    const dir = join(app, 'node_modules', '@acme', 'badge', 'native')
    mkdirSync(join(dir, 'swift'), { recursive: true })
    mkdirSync(join(dir, 'kotlin'), { recursive: true })
    writeFileSync(join(dir, 'swift', 'Other.swift'), 'final class PyreonOther {}')
    writeFileSync(join(dir, 'kotlin', 'Other.kt'), 'class PyreonOther')
    const bad = await pluginsReport(app, true)
    expect(bad.exitCode).toBe(2)
    expect(bad.lines.join('\n')).toContain('Swift type `PyreonBadge` is not declared')
    writeFileSync(join(dir, 'swift', 'Badge.swift'), 'final class PyreonBadge {}')
    writeFileSync(join(dir, 'kotlin', 'Badge.kt'), 'class PyreonBadge')
    const good = await pluginsReport(app, true)
    expect(good.exitCode).toBe(0)
    expect(good.lines.join('\n')).toContain('verify: every service type is declared')
  })

  it('explain prints hook, owner and the emitted declaration for both targets', () => {
    const source = "import { useShare } from '@pyreon/hooks'\nexport function A() { const share = useShare(); return <Button onClick={() => share.text('hi')}>x</Button> }"
    const { lines, exitCode } = explainReport(source, join(app, 'A.tsx'), createCompiler(), app)
    expect(exitCode).toBe(0)
    const text = lines.join('\n')
    expect(text).toContain('share = useShare()  [owner: @pyreon/hooks]')
    expect(text).toContain('swift:  @State private var share = PyreonShare()  (emitted)')
    expect(text).toContain('val share = remember { PyreonShare(shareCtx) }  (emitted)')
  })
})

describe("a package-owned '@pyreon/hooks' plugin replaces the built-in of the same name", () => {
  const SHARE_SOURCE =
    "import { useShare } from '@pyreon/hooks'\nexport function Example() { const share = useShare(); return <Button onClick={() => share.text('hi')}>x</Button> }"
  // ONE hook, a different Swift container: if replacement is real the emitted text changes, and the
  // built-in's other hooks (useOnline, …) are gone because the discovered plugin owns the name wholesale.
  const REPLACEMENT = pluginModule(
    '@pyreon/hooks',
    "services: { useShare: { legacyKind: 'share', swift: 'NewerShare()', kotlin: ['val {id} = remember { NewerShare() }'] } }",
  )
  const build = (...extra: string[]) =>
    mainWithPlugins(['build', '--target=ios', `--source=${join(app, 'src')}`, `--out=${join(root, 'out')}`, `--app=${app}`, ...extra])
  const emitted = () => readFileSync(join(root, 'out', 'Example.swift'), 'utf8')

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    addPackage('@pyreon/hooks', declares({ modules: ['@pyreon/hooks'] }), REPLACEMENT)
    setApp(['@pyreon/hooks'], SHARE_SOURCE)
  })

  it('loads without a duplicate-owner error and the emitted text comes from the discovered plugin', async () => {
    expect(await build()).toBe(0)
    expect(emitted()).toContain('@State private var share = NewerShare()')
    expect(emitted()).not.toContain('PyreonShare()')
  })

  it('--no-plugins keeps the built-in copy (so the difference above is the replacement, not the source)', async () => {
    expect(await build('--no-plugins')).toBe(0)
    expect(emitted()).toContain('@State private var share = PyreonShare()')
  })

  it('the registry attributes the hook to the single owner, and the built-in is not also loaded', async () => {
    const found = await discoverPlugins(app, join(app, 'src'))
    const compiler = createCompiler({ discovered: found.map((f) => f.plugin) })
    expect(compiler.services.get('useShare')?.owner).toBe('@pyreon/hooks')
    expect(compiler.services.get('useShare')?.descriptor.swift).toBe('NewerShare()')
    expect(compiler.services.has('useOnline')).toBe(false)
    const report = await pluginsReport(app, false)
    expect(report.exitCode).toBe(0)
    expect(report.lines.join('\n')).not.toContain('claimed by both')
  })
})

describe('explain with a plugin-supplied service and element', () => {
  const plugin = {
    name: '@acme/kit',
    apiVersion: 1 as const,
    modules: ['@acme/kit'],
    services: { useGadget: { swift: 'AcmeGadget()', kotlin: ['val {id} = remember { AcmeGadget() }'] } },
    elements: [
      {
        module: '@acme/ui',
        tags: ['Banner'],
        emit: { swift: () => 'AcmeBanner()', kotlin: () => 'AcmeBanner()' },
      },
    ],
  }
  const source = `import { useGadget } from '@acme/kit'
import { Banner } from '@acme/ui'
export function A() { const gadget = useGadget(); return <Button onClick={() => gadget.go()}><Banner /></Button> }`

  it('lowers the plugin hook and attributes it, and the element, to the plugin', () => {
    const { lines, exitCode } = explainReport(source, join(app, 'A.tsx'), createCompiler({ plugins: [plugin] }), app)
    expect(exitCode).toBe(0)
    const text = lines.join('\n')
    expect(text).toContain('gadget = useGadget()  [owner: @acme/kit]')
    expect(text).toContain('swift:  @State private var gadget = AcmeGadget()  (emitted)')
    expect(text).toContain('val gadget = remember { AcmeGadget() }  (emitted)')
    expect(text).toContain('<Banner> from @acme/ui  [element lowering, owner: @acme/kit]')
    expect(text).not.toContain('registered but was not lowered')
  })

  it('still flags a registered hook the parser really did not lower (a genuine failure)', () => {
    const inline = `import { useShare } from '@pyreon/hooks'
export function A() { return <Button onClick={() => useShare().text('hi')}>x</Button> }`
    const { lines } = explainReport(inline, join(app, 'A.tsx'), createCompiler(), app)
    expect(lines.join('\n')).toContain('useShare() is registered but was not lowered as a service declaration in this file')
  })

  it('the plugins listing shows element lowerings with their owners', async () => {
    const { lines } = await pluginsReport(app, false)
    expect(lines).toContain('  @pyreon/coolgrid  Container, Row, Col  @pyreon/coolgrid')
    expect(lines).toContain('  @pyreon/elements  Element  @pyreon/elements')
  })
})

describe('the shipped bin', () => {
  it('runs `plugins` and `explain` and reports exit codes only', () => {
    addPackage('@acme/badge', declares(), pluginModule('badge'))
    setApp(['@acme/badge'], "import '@acme/badge'")
    const run = (...args: string[]) => spawnSync('node', [BIN, ...args], { encoding: 'utf8', timeout: 60_000 })
    expect(run('plugins', `--app=${app}`).status).toBe(0)
    expect(run('plugins', `--app=${join(root, 'no-such-app')}`).status).toBe(0)
    expect(run('explain', join(app, 'src', 'Example.tsx'), `--app=${app}`).status).toBe(0)
    expect(run('explain').status).toBe(1)
  })
})
