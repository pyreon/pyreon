import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCompiler } from '@pyreon/native-compiler'
import { explainReport, pluginsReport } from '../plugin-commands'

// The edge branches of the two reports: a plugin that fails to load, versionless/serviceless packages, and
// every way `explain` can disagree with what the compiler actually emitted.

// `@pyreon/hooks`' plugin as the compiler sees it once discovered (the compiler carries no copy of it).

const HOOKS = {
  name: '@pyreon/hooks',
  apiVersion: 1 as const,
  modules: ['@pyreon/hooks'],
  services: {
    useShare: { legacyKind: 'share', swift: 'PyreonShare()', kotlin: ['val {id}Ctx = LocalContext.current', 'val {id} = remember { PyreonShare({id}Ctx) }'] },
  },
}

const SHARE_SOURCE = `export function Example() {
  const share = useShare()
  return <Text>x</Text>
}`

describe('explainReport — where the registry and the emit disagree', () => {
  const real = createCompiler({ plugins: [HOOKS] })
  const shareEntry = real.services.get('useShare')!
  const emit = (code: string) => ({ code }) as ReturnType<typeof real.transform>

  it('says so when a lowered hook has no registered service', () => {
    const compiler = { services: new Map(),
      registries: real.registries, transform: () => emit('') }
    const { lines, exitCode } = explainReport(SHARE_SOURCE, '/x/A.tsx', compiler, '/x')
    expect(exitCode).toBe(0)
    expect(lines.join('\n')).toContain('no service registered')
  })

  it('flags a declaration the emit does not contain', () => {
    const compiler = { services: new Map([['useShare', shareEntry]]), registries: real.registries, transform: () => emit('// nothing') }
    const { lines } = explainReport(SHARE_SOURCE, '/x/A.tsx', compiler, '/x')
    expect(lines.join('\n')).toContain('NOT in emit')
  })

  it('reports a registered hook the file calls but the parser did not lower', () => {
    const source = `export function Example() {\n  return <Text>{String(useShare())}</Text>\n}`
    const compiler = { services: new Map([['useShare', shareEntry]]), registries: real.registries, transform: () => emit('') }
    const { lines, exitCode } = explainReport(source, '/x/A.tsx', compiler, '/x')
    expect(exitCode).toBe(0)
    expect(lines.join('\n')).toMatch(/useShare\(\) is registered but was not lowered/)
  })

  it('says there are no service hooks for a file that uses none', () => {
    const { lines, exitCode } = explainReport(
      `export function Example() { return <Text>plain</Text> }`,
      '/x/A.tsx',
      real,
      '/x',
    )
    expect(exitCode).toBe(0)
    expect(lines.at(-1)).toMatch(/no service hooks/)
  })

  it('exits 2 with the message when the compiler throws', () => {
    const compiler = {
      services: new Map(),
      registries: real.registries,
      transform: () => {
        throw new Error('boom from the compiler')
      },
    }
    const { lines, exitCode } = explainReport(SHARE_SOURCE, '/x/A.tsx', compiler, '/x')
    expect(exitCode).toBe(2)
    expect(lines.join('\n')).toContain('boom from the compiler')
  })

  it('exits 2 and stringifies a non-Error throw', () => {
    const compiler = {
      services: new Map(),
      registries: real.registries,
      transform: () => {
        throw 'plain string'
      },
    }
    const { lines, exitCode } = explainReport(SHARE_SOURCE, '/x/A.tsx', compiler, '/x')
    expect(exitCode).toBe(2)
    expect(lines.join('\n')).toContain('plain string')
  })

  it('has services to explain at all (the fixture is real)', () => {
    expect(real.services.has('useShare')).toBe(true)
  })
})

describe('pluginsReport — discovery edge cases', () => {
  let root: string
  let app: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pyreon-native-pluginsreport-'))
    app = join(root, 'app')
    mkdirSync(app)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  function addPackage(name: string, plugin: string, extra: Record<string, unknown> = {}) {
    const dir = join(app, 'node_modules', ...name.split('/'))
    mkdirSync(join(dir, 'native'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name, ...extra, pyreon: { native: { plugin: 'native/plugin.mjs' } } }),
    )
    writeFileSync(join(dir, 'native', 'plugin.mjs'), plugin)
    writeFileSync(
      join(app, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { [name]: '1' } }),
    )
  }

  it('exits 2 and names the failure when a declared plugin cannot load', async () => {
    addPackage('@acme/broken', `throw new Error('plugin module exploded')`)
    const { lines, exitCode } = await pluginsReport(app, false)
    expect(exitCode).toBe(2)
    expect(lines.join('\n')).toContain('[pyreon-native]')
  })

  it('stringifies a non-Error failure while loading', async () => {
    addPackage('@acme/thrower', `throw 'not an Error object'`)
    const { lines, exitCode } = await pluginsReport(app, false)
    expect(exitCode).toBe(2)
    expect(lines.join('\n')).toContain('not an Error object')
  })

  it('lists a versionless, serviceless plugin with a dash', async () => {
    addPackage('@acme/plain', `export default { name: 'plain', apiVersion: 1 }`)
    const { lines, exitCode } = await pluginsReport(app, false)
    expect(exitCode).toBe(0)
    const row = lines.find((l) => l.includes('@acme/plain'))!
    expect(row).toContain('services: -')
    expect(row).not.toContain('@acme/plain@')
  })

  it('shows the version when the package has one', async () => {
    addPackage('@acme/versioned', `export default { name: 'versioned', apiVersion: 1 }`, { version: '2.3.4' })
    const { lines } = await pluginsReport(app, false)
    expect(lines.find((l) => l.includes('@acme/versioned'))).toContain('@acme/versioned@2.3.4')
  })

  it('lists a package plugin’s capabilities and sorts each registry by name', async () => {
    addPackage(
      '@acme/rich',
      `export default {
        name: 'rich',
        apiVersion: 1,
        services: { useRich: { swift: 'Rich()', kotlin: ['val {id} = Rich()'] } },
        elements: [{ module: '@acme/ui', tags: ['Banner', 'Badge'], emit: { swift: () => 'B()', kotlin: () => 'B()' } }],
        calls: { createZulu: () => ({ type: 'rich' }), createAlpha: () => ({ type: 'rich' }) },
        decls: { rich: { swift: () => 'let rich = Rich()', kotlin: () => ['val rich = Rich()'] } },
        memberCalls: {
          write: { swift: () => '()', kotlin: () => 'Unit' },
          read: { swift: () => '()', kotlin: () => 'Unit' },
        },
        unlowered: { '@acme/web': { advice: 'web only' }, '@acme/browser': { advice: 'browser only' } },
      }`,
    )
    const { lines, exitCode } = await pluginsReport(app, false)
    expect(exitCode).toBe(0)
    const row = lines.find((l) => l.includes('@acme/rich'))!
    expect(row).toContain('elements: Banner, Badge')
    expect(row).toContain('unlowered: @acme/web, @acme/browser')
    expect(row).toContain('services: useRich')
    expect(row).toContain('calls: createZulu, createAlpha')
    expect(row).toContain('memberCalls: write, read')
    expect(lines).toContain('  createAlpha  rich  decls: rich')
    expect(lines).toContain('  createZulu  rich  decls: rich')
    expect(lines.indexOf('  createAlpha  rich  decls: rich')).toBeLessThan(lines.indexOf('  createZulu  rich  decls: rich'))
    expect(lines.indexOf('  .read()  rich')).toBeLessThan(lines.indexOf('  .write()  rich'))
    expect(lines).toContain('  .read()  rich')
    expect(lines).toContain('  .write()  rich')
    expect(lines).toContain('  @acme/browser  rich')
    expect(lines).toContain('  @acme/web  rich')
    expect(lines.indexOf('  @acme/browser  rich')).toBeLessThan(lines.indexOf('  @acme/web  rich'))
  })

  it('reports every module-item owner and method recognizer in stable order', async () => {
    addPackage('@acme/zebra', `export default {
      name: 'zebra', apiVersion: 1,
      topLevel: () => undefined,
      items: { node: { swift: () => [], kotlin: () => [] }, leaf: { swift: () => [], kotlin: () => [] } },
      methodCalls: { zulu: () => undefined },
      refineStructs: () => {}, finishModule: () => {},
    }`)
    addPackage('@acme/alpha', `export default {
      name: 'alpha', apiVersion: 1,
      items: { value: { swift: () => [], kotlin: () => [] } },
      methodCalls: { alpha: () => undefined },
    }`)
    writeFileSync(join(app, 'package.json'), JSON.stringify({
      name: 'app', dependencies: { '@acme/zebra': '1', '@acme/alpha': '1' },
    }))
    const { lines, exitCode } = await pluginsReport(app, false)
    expect(exitCode).toBe(0)
    expect(lines).toContain('module items (3):')
    expect(lines).toContain('  alpha  value')
    expect(lines).toContain('  zebra  node, leaf  topLevel')
    expect(lines.indexOf('  alpha  value')).toBeLessThan(lines.indexOf('  zebra  node, leaf  topLevel'))
    expect(lines).toContain('method-call recognizers (2):')
    expect(lines).toContain('  .alpha()  alpha')
    expect(lines).toContain('  .zulu()  zebra')
    expect(lines.indexOf('  .alpha()  alpha')).toBeLessThan(lines.indexOf('  .zulu()  zebra'))
    expect(lines.find((line) => line.includes('@acme/zebra'))).toContain('refineStructs  finishModule')
    expect(lines.find((line) => line.includes('@acme/alpha'))).not.toContain('refineStructs')
  })
})
