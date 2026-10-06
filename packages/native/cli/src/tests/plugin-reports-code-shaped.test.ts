import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCompiler, type CompilerPlugin } from '@pyreon/native-compiler'
import { explainReport, pluginsReport } from '../plugin-commands'

// `plugins` and `explain` over a CODE-SHAPED plugin (a call recognizer + a decl
// emitter), the surface a package ships when its lowering is more than a
// service descriptor. The shape mirrors the compiler's own toy plugin.

const TOY_APP = `import { createToy } from '@acme/toy'
import { Text } from '@pyreon/primitives'
export function App() { const toy = createToy('hello'); return <Text>{toy.label}</Text> }`

const toyPlugin = (over: Partial<CompilerPlugin> = {}): CompilerPlugin => ({
  name: '@acme/toy',
  apiVersion: 1,
  modules: ['@acme/toy'],
  calls: {
    createToy: (_call, ctx) => {
      const label = ctx.stringLiteralArg(0)
      return label === undefined ? undefined : { type: 'toy', payload: { label } }
    },
  },
  decls: {
    toy: {
      swift: (d, ctx) => `@State private var ${ctx.ident(d.name)} = ToyBox(label: ${ctx.stringLiteral(String(d.payload.label))})`,
      kotlin: (d, ctx) => [`val ${ctx.ident(d.name)} = remember { ToyBox(${ctx.stringLiteral(String(d.payload.label))}) }`],
    },
  },
  ...over,
})

describe('explainReport — a call a plugin recognized', () => {
  it('attributes the call to its owner and says it emitted', () => {
    const compiler = createCompiler({ plugins: [toyPlugin()] })
    const { lines, exitCode } = explainReport(TOY_APP, '/app/App.tsx', compiler, '/app')
    expect(exitCode).toBe(0)
    const out = lines.join('\n')
    expect(out).toContain('toy = toy  [call recognizer, owner: @acme/toy]')
    expect(out).not.toContain('NO emitter registered')
  })

  it('reports a file the plugin does not recognize as having nothing to explain', () => {
    const compiler = createCompiler({ plugins: [toyPlugin()] })
    const { lines, exitCode } = explainReport(
      `export function App() { return <Text>plain</Text> }`,
      '/app/App.tsx',
      compiler,
      '/app',
    )
    expect(exitCode).toBe(0)
    expect(lines.at(-1)).toMatch(/no service hooks/)
  })
})

describe('pluginsReport — a discovered code-shaped plugin', () => {
  let root: string
  let app: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pyreon-native-codeplugin-'))
    app = join(root, 'app')
    mkdirSync(app)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  function addToyPackage(withNativeSources: boolean) {
    const dir = join(app, 'node_modules', '@acme', 'toy')
    mkdirSync(join(dir, 'native'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: '@acme/toy',
        version: '1.0.0',
        pyreon: { native: { plugin: 'native/plugin.mjs' } },
      }),
    )
    writeFileSync(
      join(dir, 'native', 'plugin.mjs'),
      `export default {
        name: '@acme/toy', apiVersion: 1, modules: ['@acme/toy'],
        services: { useToy: { swift: 'ToyService()', kotlin: ['val {id} = remember { ToyService() }'] } },
        calls: { createToy: () => undefined },
        decls: { toy: { swift: () => '', kotlin: () => [] } },
      }`,
    )
    if (withNativeSources) {
      // A nested directory, a Swift file, a Kotlin file and a file of neither
      // kind: the verifier must walk into folders and skip what is not source.
      mkdirSync(join(dir, 'native', 'swift', 'nested'), { recursive: true })
      mkdirSync(join(dir, 'native', 'kotlin'), { recursive: true })
      writeFileSync(join(dir, 'native', 'swift', 'nested', 'ToyService.swift'), 'final class ToyService {}')
      writeFileSync(join(dir, 'native', 'swift', 'NOTES.txt'), 'not source')
      writeFileSync(join(dir, 'native', 'kotlin', 'ToyService.kt'), 'class ToyService')
    }
    writeFileSync(
      join(app, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { '@acme/toy': '1.0.0' } }),
    )
  }

  it('lists the plugin with its services and the call recognizers it brings', async () => {
    addToyPackage(false)
    const { lines, exitCode } = await pluginsReport(app, false)
    expect(exitCode).toBe(0)
    const out = lines.join('\n')
    expect(out).toMatch(/@acme\/toy\s+@acme\/toy@1\.0\.0\s+services: useToy/)
    expect(out).toMatch(/call recognizers \(\d+\):/)
    expect(out).toMatch(/createToy\s+@acme\/toy/)
  })

  it('--verify walks nested native sources and passes when the types are declared there', async () => {
    addToyPackage(true)
    const { lines, exitCode } = await pluginsReport(app, true)
    expect(lines.join('\n')).toContain('verify: every service type is declared')
    expect(exitCode).toBe(0)
  })

  it('--verify fails when the package ships no native sources declaring the type', async () => {
    addToyPackage(false)
    const { lines, exitCode } = await pluginsReport(app, true)
    expect(exitCode).toBe(2)
    expect(lines.join('\n')).toContain('verify: @acme/toy [swift]')
  })
})
