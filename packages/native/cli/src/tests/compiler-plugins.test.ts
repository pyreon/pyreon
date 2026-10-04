import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createCompiler,
  type CompilerPlugin,
  validateKotlin,
  validateSwiftWithStubs,
  isKotlincAvailable,
  isSwiftcAvailable,
} from '@pyreon/native-compiler'
import { build } from '../build'
import { check, checkSource, watchCheck } from '../check'
import { _handleMessage, _resetOpenDocuments, _setNotify, diagnosticsForDocument } from '../lsp'
import { main, mainWithPlugins } from '../cli'

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '../../bin/pyreon-native.js')
const APP = 'export function Example() { return <ReleaseBadge /> }'
const PLUGIN = `export default {
  name: 'release-badge', apiVersion: 1,
  transformIR(module) {
    for (const component of module.components) {
      if (component.returnExpr.kind === 'jsx-element' && component.returnExpr.tag === 'ReleaseBadge') {
        component.returnExpr = { kind: 'jsx-element', tag: 'Text', attrs: [], children: [{kind: 'text', value: 'Plugin loaded'}] }
      }
    }
  }
}`
let root: string
let source: string
let path: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-native-plugins-'))
  source = join(root, 'src')
  mkdirSync(source)
  writeFileSync(join(source, 'Example.tsx'), APP)
  path = join(root, 'release plugin.mjs')
  writeFileSync(path, PLUGIN)
})
afterEach(() => {
  _resetOpenDocuments()
  _setNotify(() => {})
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})
const run = (...args: string[]) =>
  spawnSync('node', [BIN, ...args], { encoding: 'utf8', timeout: 60_000 })

describe('published compiler plugin CLI', () => {
  it('loads repeatable plugins using both flag forms and emits both real native targets', () => {
    const second = join(root, 'second.mjs')
    writeFileSync(
      second,
      `export default {name:'second',apiVersion:1,prepareIR(module,context){context.warn('second plugin')}}`,
    )
    const out = join(root, 'out')
    const result = run(
      'build',
      '--target=all',
      `--source=${source}`,
      `--out=${out}`,
      `--plugin=${path}`,
      '--plugin',
      second,
    )
    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toContain('second plugin')
    // An equivalent built-in source must produce the same complete CLI files.
    writeFileSync(
      join(source, 'Example.tsx'),
      'export function Example() { return <Text>Plugin loaded</Text> }',
    )
    const baselineOut = join(root, 'baseline')
    const baseline = run('build', '--target=all', `--source=${source}`, `--out=${baselineOut}`)
    expect(baseline.status, baseline.stderr).toBe(0)
    for (const [target, extension] of [
      ['ios', 'swift'],
      ['android', 'kt'],
    ] as const) {
      const code = readFileSync(join(out, target, `Example.${extension}`), 'utf8')
      expect(code).toContain('Plugin loaded')
      expect(code).toBe(readFileSync(join(baselineOut, target, `Example.${extension}`), 'utf8'))
      if (!(target === 'ios' ? isSwiftcAvailable() : isKotlincAvailable())) continue
      // Compose validator stubs use a flat package; CLI Android imports belong
      // to the real SDK and are verified separately by device builds.
      const verdict =
        target === 'ios'
          ? validateSwiftWithStubs(code)
          : validateKotlin(code.replace(/^import .*\n/gm, ''))
      expect(verdict.ok, verdict.error).toBe(true)
    }
  })
  it('uses the same configured pipeline for JSON check diagnostics', () => {
    const warning = join(root, 'warning.mjs')
    writeFileSync(
      warning,
      `export default {name:'warning',apiVersion:1,transformIR(module,context){context.warn('plugin check')}}`,
    )
    const result = run(
      'check',
      '--json',
      `--source=${source}`,
      `--plugin=${path}`,
      `--plugin=${warning}`,
    )
    expect(result.status, result.stderr).toBe(0)
    const report = JSON.parse(result.stdout)
    expect(report.errorCount).toBe(0)
    expect(report.warningCount).toBe(2)
    expect(report.findings.map((f: { message: string }) => f.message)).toEqual([
      '[Pyreon] plugin "warning": plugin check',
      '[Pyreon] plugin "warning": plugin check',
    ])
  })
  it('exits with a usage error for an unsupported target in watch mode', () => {
    const result = run('check', '--watch', '--target=rust', `--source=${source}`)
    expect(result.status, result.stderr).toBe(1)
    expect(result.stderr).toContain('Unknown check target')
  })
  it.each([
    ['--plugin=', /requires a local module path/],
    ['--plugin', /requires a local module path/],
    ['--plugin=missing.mjs', /plugin setup failed/],
  ])('reports loader failures and exits even in watch mode: %s', (flag, message) => {
    const result = run('check', `--source=${source}`, '--watch', flag)
    expect(result.status, result.stderr).toBe(2)
    expect(result.stderr).toMatch(message)
  })
  it.each([
    ['export const plugin = {}', /nonempty name/],
    ["export default {name:'version',apiVersion:2}", /supports API 1/],
    [
      "export default {name:'throws',apiVersion:1,transformIR(){throw Error('pass failure')}}",
      /pass failure/,
    ],
  ])('reports unusable plugin modules without successful outputs %#', (code, message) => {
    writeFileSync(path, code)
    const result = run(
      'build',
      '--target=ios',
      `--source=${source}`,
      `--out=${join(root, 'out')}`,
      `--plugin=${path}`,
    )
    expect(result.status, result.stderr).toBe(2)
    expect(result.stderr).toMatch(message)
  })
  it('rejects --plugin on unrelated commands and keeps help successful', () => {
    expect(run('wire', `--plugin=${path}`).status).toBe(1)
    expect(run('--help', `--plugin=${path}`).status).toBe(0)
  })
  it('loads the configured compiler in the actual stdio LSP transport', () => {
    const warning = join(root, 'lsp.mjs')
    writeFileSync(
      warning,
      `export default {name:'editor',apiVersion:1,transformIR(module,context){context.warn('editor plugin')}}`,
    )
    const message = {
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file://' + join(source, 'Example.tsx'), text: APP } },
    }
    const body = JSON.stringify(message)
    const input = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
    const result = spawnSync('node', [BIN, 'check', '--lsp', `--plugin=${warning}`], {
      encoding: 'utf8',
      input,
      timeout: 60_000,
    })
    expect(result.status, result.stderr).toBe(0)
    const response = JSON.parse(result.stdout.slice(result.stdout.indexOf('\r\n\r\n') + 4))
    expect(response.method).toBe('textDocument/publishDiagnostics')
    expect(response.params.diagnostics.map((d: { message: string }) => d.message)).toEqual([
      '[swift] [Pyreon] plugin "editor": editor plugin',
      '[kotlin] [Pyreon] plugin "editor": editor plugin',
    ])
  })
  it('loads plugins through the programmatic asynchronous entry for build and check', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = join(root, 'programmatic')
    expect(
      await mainWithPlugins([
        'build',
        '--target=ios',
        `--source=${source}`,
        `--out=${out}`,
        `--plugin=${path}`,
      ]),
    ).toBe(0)
    expect(readFileSync(join(out, 'Example.swift'), 'utf8')).toContain('Plugin loaded')
    expect(await mainWithPlugins(['check', `--source=${source}`, `--plugin=${path}`])).toBe(0)
    expect(await mainWithPlugins(['check', `--source=${source}`])).toBe(0)
    expect(await mainWithPlugins(['--help'])).toBe(0)
    writeFileSync(join(root, 'bad.mjs'), `export default {name:'bad',apiVersion:2}`)
    expect(
      await mainWithPlugins(['check', `--source=${source}`, `--plugin=${join(root, 'bad.mjs')}`]),
    ).toBe(2)
  })
  it('retains the synchronous main entry and offers an async loader entry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(main(['check', `--plugin=${path}`])).toBe(1)
    expect(await mainWithPlugins(['wire', `--plugin=${path}`])).toBe(1)
    expect(await mainWithPlugins(['check', '--plugin='])).toBe(2)
  })
})

describe('configured build/check/watch/editor pipeline', () => {
  it('shares compiler diagnostics across the programmatic entry points', async () => {
    const extension: CompilerPlugin<never> = {
      name: 'shared',
      apiVersion: 1,
      transformIR(_module, context) {
        context.warn('configured')
      },
    }
    const compiler = createCompiler({ plugins: [extension] })
    const file = join(source, 'Example.tsx')
    const result = build({ source, out: join(root, 'generated'), target: 'swift', compiler })
    expect(result.warnings.some((w) => w.warning.includes('configured'))).toBe(true)
    expect(check({ source, compiler }).warningCount).toBe(2)
    expect(checkSource(APP, file, { targets: ['swift'], compiler }).findings[0]!.message).toContain(
      'configured',
    )
    expect(
      diagnosticsForDocument(APP, file, compiler).some((d) => d.message.includes('configured')),
    ).toBe(true)
    const notify = vi.fn()
    _setNotify(notify)
    _handleMessage(
      {
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: 'file://' + file, text: APP } },
      },
      compiler,
    )
    expect(
      notify.mock.calls[0]![1].diagnostics.some((d: { message: string }) =>
        d.message.includes('configured'),
      ),
    ).toBe(true)
    const controller = new AbortController()
    const results: number[] = []
    await watchCheck(
      { source, compiler },
      {
        signal: controller.signal,
        onResult(r) {
          results.push(r.warningCount)
          controller.abort()
        },
      },
    )
    expect(results).toEqual([2])
  })
})
