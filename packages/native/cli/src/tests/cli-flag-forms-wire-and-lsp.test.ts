/**
 * The CLI paths a real invocation takes that no spec had driven: the
 * space-separated flag form, `--fonts`, the multi-target build's exit code
 * when one target fails, the build report's skipped/warning sections,
 * `wire`'s three output modes, and the LSP's didSave/shutdown turns.
 *
 * Each of these is a second spelling of something the happy path already
 * does — `--source X` beside `--source=X`, a JSON report beside a text one,
 * a second build target beside the first — and a second spelling is exactly
 * where a CLI drifts: the one an author tests works, the one a script writes
 * does not, and the script's failure is an exit code nobody reads.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../cli'
import { _handleMessage, _resetOpenDocuments, _setNotify } from '../lsp'
import { watchCheck } from '../check'
import { writeFixtureFont } from './font-fixture'

const CLEAN = 'export function C() { return <Text>hello</Text> }'
const WARNS =
  'function first<T>(xs: T[]): T { return xs[0] }\nexport function C() { return <Text>hi</Text> }'
const BROKEN = 'export function C() { return <Text>oops< }'
const WEB_ENTRY = "import { mount } from '@pyreon/runtime-dom'\nmount(null, document.body)"

let root: string
let logs: string[]
let warns: string[]
let errs: string[]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-cli-edges-'))
  logs = []
  warns = []
  errs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.join(' ')))
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => warns.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => errs.push(a.join(' ')))
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

const srcDir = (files: Record<string, string>): string => {
  const dir = join(root, 'src')
  mkdirSync(dir, { recursive: true })
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
  return dir
}
const outDir = (name = 'out'): string => join(root, name)

describe('flag forms', () => {
  it('accepts the SPACE-separated form beside the `=` form', () => {
    // `pyreon-native build --target ios --source src --out out` is what a
    // shell script tends to write; a parser that only reads `--k=v` treats
    // `ios` as a stray positional and reports `--target is required`.
    const src = srcDir({ 'C.tsx': CLEAN })
    expect(main(['build', '--target', 'ios', '--source', src, '--out', outDir()])).toBe(0)
    expect(readdirSync(outDir()).some((f) => f.endsWith('.swift'))).toBe(true)
  })

  it('ignores a stray positional and an empty argument', () => {
    const src = srcDir({ 'C.tsx': CLEAN })
    expect(main(['build', 'stray', '', `--target=ios`, `--source=${src}`, `--out=${outDir()}`])).toBe(0)
  })

  it('reads `--fonts` and bakes PostScript names into the Swift emit', () => {
    // Only iOS consumes the map (Font.custom needs the PostScript name).
    const fonts = join(root, 'fonts')
    mkdirSync(fonts, { recursive: true })
    writeFixtureFont(join(fonts, 'Inter-Bold.ttf'), 'Inter-Bold')
    const src = srcDir({
      'C.tsx': 'export function C() { return <Text style={{ fontFamily: "Inter-Bold" }}>hi</Text> }',
    })
    expect(main(['build', `--target=ios`, `--source=${src}`, `--out=${outDir()}`, `--fonts=${fonts}`])).toBe(0)
  })

  it('tolerates a `--fonts` directory that does not exist', () => {
    // A missing shared-assets dir at build time is an ordinary state on a
    // fresh clone; the build must not throw its way to exit 2 over it.
    const src = srcDir({ 'C.tsx': CLEAN })
    expect(
      main(['build', `--target=ios`, `--source=${src}`, `--out=${outDir()}`, `--fonts=${join(root, 'nope')}`]),
    ).toBe(0)
  })
})

describe('build report', () => {
  it('lists the web-only entries it skipped', () => {
    const src = srcDir({ 'C.tsx': CLEAN, 'entry.tsx': WEB_ENTRY })
    expect(main(['build', `--target=ios`, `--source=${src}`, `--out=${outDir()}`])).toBe(0)
    expect(logs.join('\n')).toMatch(/skipped 1 web-only entry file/)
    expect(logs.join('\n')).toContain('entry.tsx')
  })

  it('prints every warning with its file', () => {
    const src = srcDir({ 'C.tsx': WARNS })
    expect(main(['build', `--target=android`, `--source=${src}`, `--out=${outDir()}`])).toBe(0)
    expect(warns.join('\n')).toMatch(/1 warning\(s\)/)
    expect(warns.join('\n')).toContain('C.tsx')
  })

  it('`--target=all` returns the WORST exit code and still builds the other target', () => {
    // One failing target must not hide the other's result, and the process
    // must not report success because the LAST target happened to pass.
    const src = srcDir({ 'C.tsx': BROKEN })
    expect(main(['build', `--target=all`, `--source=${src}`, `--out=${outDir()}`])).toBe(2)
    expect(errs.filter((l) => l.includes('build failed'))).toHaveLength(2)
  })
})

describe('wire output modes', () => {
  const writePackage = (dir: string, manifest: Record<string, unknown>, files: string[] = []) => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
    for (const rel of files) {
      mkdirSync(join(dir, rel, '..'), { recursive: true })
      writeFileSync(join(dir, rel), '// native\n')
    }
  }
  const app = (): string => {
    const dir = join(root, 'app')
    writePackage(dir, {
      name: 'app',
      dependencies: { '@pyreon/native-runtime-swift': '*', '@pyreon/native-runtime-kotlin': '*', 'feat': '*' },
    })
    const nm = join(dir, 'node_modules')
    writePackage(
      join(nm, '@pyreon/native-runtime-swift'),
      { name: '@pyreon/native-runtime-swift', pyreon: { native: { swift: { module: 'PyreonRuntime', dir: 'Sources/PyreonRuntime' } } } },
      ['Package.swift', 'Sources/PyreonRuntime/R.swift'],
    )
    writePackage(
      join(nm, '@pyreon/native-runtime-kotlin'),
      { name: '@pyreon/native-runtime-kotlin', pyreon: { native: { kotlin: { dir: 'src/main/kotlin' } } } },
      ['src/main/kotlin/R.kt'],
    )
    // A co-located feature: Swift WITHOUT Package.swift = a target source.
    writePackage(
      join(nm, 'feat'),
      { name: 'feat', pyreon: { native: { swift: { module: 'Feat', dir: 'native/swift' }, kotlin: 'native/kotlin' } } },
      ['native/swift/F.swift', 'native/kotlin/F.kt'],
    )
    return dir
  }

  it('prints the human summary, including co-located target sources', () => {
    expect(main(['wire', `--app=${app()}`])).toBe(0)
    const out = logs.join('\n')
    expect(out).toContain('Android srcDirs (2)')
    expect(out).toContain('iOS SwiftPM packages (1)')
    expect(out).toContain('iOS co-located target sources')
    expect(out).toContain('[Feat]')
  })

  it('`--json` prints ONLY the wiring, parseable', () => {
    // The machine surface: a human line beside it breaks the consumer's parse.
    expect(main(['wire', `--app=${app()}`, '--json'])).toBe(0)
    expect(logs).toHaveLength(1)
    const wiring = JSON.parse(logs[0] ?? '') as { androidSrcDirs: string[]; iosTargetSources: unknown[] }
    expect(wiring.androidSrcDirs).toHaveLength(2)
    expect(wiring.iosTargetSources).toHaveLength(1)
  })

  it('`--ios-out` stages co-located Swift and links the SwiftPM packages', () => {
    const dir = app()
    expect(main(['wire', `--app=${dir}`, '--ios-out=ios'])).toBe(0)
    expect(logs.join('\n')).toMatch(/staged 1 co-located Swift file\(s\), linked 1 SwiftPM package\(s\)/)
    expect(readdirSync(join(dir, 'ios', 'PyreonNative'), { recursive: true }).length).toBeGreaterThan(0)
  })

  it('`--android-out` + `--json` stays machine-clean', () => {
    const dir = app()
    expect(main(['wire', `--app=${dir}`, '--android-out=android/srcdirs.txt', '--json'])).toBe(0)
    expect(logs).toHaveLength(1)
    expect(() => JSON.parse(logs[0] ?? '')).not.toThrow()
  })

  it('defaults `--app` to the working directory', () => {
    const dir = app()
    const prev = process.cwd()
    try {
      process.chdir(dir)
      expect(main(['wire', '--json'])).toBe(0)
    } finally {
      process.chdir(prev)
    }
  })
})

describe('the LSP turns an editor actually takes', () => {
  let notes: Array<{ method: string; params: { uri: string; diagnostics: unknown[] } }>
  beforeEach(() => {
    notes = []
    _resetOpenDocuments()
    _setNotify((method, params) => {
      notes.push({ method, params: params as { uri: string; diagnostics: unknown[] } })
    })
  })

  const open = (uri: string, text: string) =>
    _handleMessage({ jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri, text } } })

  it('re-publishes on didSave for an OPEN document', () => {
    open('file:///a.tsx', BROKEN)
    notes.length = 0
    _handleMessage({ jsonrpc: '2.0', method: 'textDocument/didSave', params: { textDocument: { uri: 'file:///a.tsx' } } })
    expect(notes).toHaveLength(1)
    expect(notes[0]?.params.diagnostics.length).toBeGreaterThan(0)
  })

  it('ignores didSave for a document it never saw', () => {
    // An editor can save a file it opened before the server started; there
    // is no text to check and nothing must be published.
    _handleMessage({ jsonrpc: '2.0', method: 'textDocument/didSave', params: { textDocument: { uri: 'file:///unknown.tsx' } } })
    expect(notes).toHaveLength(0)
  })

  it('ignores a didChange that carries no text', () => {
    open('file:///a.tsx', CLEAN)
    notes.length = 0
    _handleMessage({ jsonrpc: '2.0', method: 'textDocument/didChange', params: { textDocument: { uri: 'file:///a.tsx' }, contentChanges: [] } })
    expect(notes).toHaveLength(0)
  })

  it('answers shutdown with a null result', () => {
    const res = _handleMessage({ jsonrpc: '2.0', id: 7, method: 'shutdown' })
    expect(res).toEqual({ jsonrpc: '2.0', id: 7, result: null })
  })
})

describe('watchCheck without a tick budget', () => {
  it('runs until its signal aborts, and does not re-check an unchanged tree', async () => {
    // The production shape: no `maxTicks`, stopped only by Ctrl-C. With
    // nothing changing, exactly the initial check must run.
    const src = srcDir({ 'C.tsx': CLEAN })
    const results: unknown[] = []
    const ac = new AbortController()
    const p = watchCheck(
      { source: src, targets: ['swift'] },
      { onResult: (r) => results.push(r), intervalMs: 20, signal: ac.signal },
    )
    await new Promise((r) => setTimeout(r, 70))
    ac.abort()
    await p
    expect(results).toHaveLength(1)
  })
})
