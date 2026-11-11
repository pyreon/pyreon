import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPreset } from '../config/presets'
import {
  _computeCodeActions,
  _configFor,
  _handleMessage,
  _reloadConfig,
  _resetOpenDocuments,
  _takeFrames,
  _toLspDiagnostics,
  FIX_ALL_KIND,
} from '../lsp/index'
import { allRules } from '../rules/index'
import { applyFixes, lintFile } from '../runner'
import type { Diagnostic } from '../types'

/**
 * Code actions over the JSON-RPC surface — what an editor's "quick fix" menu
 * and `editor.codeActionsOnSave: { "source.fixAll.pyreon": "explicit" }` call.
 * Before this, the server advertised no `codeActionProvider`, so not one of the
 * package's autofixes could be applied from an editor.
 */

interface Pos {
  line: number
  character: number
}

interface TextEdit {
  range: { start: Pos; end: Pos }
  newText: string
}

interface Action {
  title: string
  kind: string
  diagnostics?: unknown[]
  edit: { changes: Record<string, TextEdit[]> }
}

function offsetOf(text: string, p: Pos): number {
  let line = 0
  let i = 0
  while (line < p.line) {
    i = text.indexOf('\n', i) + 1
    line++
  }

  return i + p.character
}

/** Apply LSP TextEdits the way an editor does: all ranges refer to the ORIGINAL text. */
function applyEdits(text: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => offsetOf(text, b.range.start) - offsetOf(text, a.range.start))
  let out = text
  for (const e of sorted) {
    out = out.slice(0, offsetOf(text, e.range.start)) + e.newText + out.slice(offsetOf(text, e.range.end))
  }

  return out
}

const SOURCE = [
  "import { signal } from '@pyreon/reactivity'",
  'export function Counter() {',
  '  const count = signal(0)',
  '  const inc = () => count.set(count() + 1)',
  '  return <button onClick={inc}>{count}</button>',
  '}',
  'export function label(a: string) {',
  '  const b = a.trim()',
  '  const c = b.toUpperCase()',
  '  const d = `${c}!`',
  '  return d',
  '}',
  '',
].join('\n')

let silence: ReturnType<typeof vi.spyOn> | undefined

beforeEach(() => {
  // didOpen publishes diagnostics to stdout (the JSON-RPC transport).
  silence = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  _resetOpenDocuments()
})

afterEach(() => {
  silence?.mockRestore()
  _reloadConfig(undefined)
})

async function open(uri: string, text: string) {
  await _handleMessage({ jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri, text } } })
}

async function codeActions(uri: string, only?: string[], range?: { start: Pos; end: Pos }): Promise<Action[]> {
  const res = await _handleMessage({
    jsonrpc: '2.0',
    id: 7,
    method: 'textDocument/codeAction',
    params: {
      textDocument: { uri },
      range: range ?? { start: { line: 0, character: 0 }, end: { line: 999, character: 0 } },
      context: { diagnostics: [], ...(only ? { only } : {}) },
    },
  })

  return (res as { result: Action[] }).result
}

describe('LSP code actions', () => {
  it('advertises quick fixes and the fix-all source action', async () => {
    const res = (await _handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' })) as {
      result: { capabilities: { codeActionProvider: { codeActionKinds: string[] } } }
    }
    expect(res.result.capabilities.codeActionProvider.codeActionKinds).toEqual(['quickfix', FIX_ALL_KIND])
    expect(FIX_ALL_KIND).toBe('source.fixAll.pyreon')
  })

  it('source.fixAll.pyreon returns ONE action whose edits equal `--fix`', async () => {
    _reloadConfig(getPreset(['recommended', 'readable']))
    const uri = 'file:///proj/src/Counter.tsx'
    await open(uri, SOURCE)
    const actions = await codeActions(uri, [FIX_ALL_KIND])
    expect(actions.map((a) => a.kind)).toEqual([FIX_ALL_KIND])
    const edits = actions[0]!.edit.changes[uri]!
    // Zero-width insertions, not a whole-document replacement.
    for (const e of edits) expect(e.range.start).toEqual(e.range.end)
    const viaCli = applyFixes(SOURCE, lintFile('/proj/src/Counter.tsx', SOURCE, allRules, getPreset(['recommended', 'readable'])).diagnostics)
    expect(applyEdits(SOURCE, edits)).toBe(viaCli)
    expect(viaCli).toContain('  const count = signal(0)\n\n  const inc')
  })

  it('a request for the parent kind `source.fixAll` gets the pyreon action too', async () => {
    _reloadConfig(getPreset(['recommended', 'readable']))
    const uri = 'file:///proj/src/A.tsx'
    await open(uri, SOURCE)
    expect((await codeActions(uri, ['source.fixAll'])).map((a) => a.kind)).toEqual([FIX_ALL_KIND])
    expect(await codeActions(uri, ['refactor'])).toEqual([])
  })

  it('quick fixes cover only the requested range, each fixing its own diagnostic', async () => {
    _reloadConfig(getPreset(['recommended', 'readable']))
    const uri = 'file:///proj/src/B.tsx'
    await open(uri, SOURCE)
    // Line 10 (0-based) is `  return d` in `label`.
    const actions = await codeActions(uri, ['quickfix'], { start: { line: 10, character: 0 }, end: { line: 10, character: 5 } })
    const fixes = actions.filter((a) => a.diagnostics)
    expect(fixes).toHaveLength(1)
    expect(fixes[0]!.title).toContain('pyreon/padding-before-return')
    const after = applyEdits(SOURCE, fixes[0]!.edit.changes[uri]!)
    expect(after).toContain('  const d = `${c}!`\n\n  return d')
    // …and nothing else changed.
    expect(after.replace('`${c}!`\n\n', '`${c}!`\n')).toBe(SOURCE)
  })

  it('offers "fix all of this rule" once when a rule has several findings', async () => {
    _reloadConfig(getPreset(['recommended', 'readable']))
    const uri = 'file:///proj/src/C.tsx'
    await open(uri, SOURCE)
    const titles = (await codeActions(uri, ['quickfix'])).map((a) => a.title)
    expect(titles.filter((t) => t === 'Fix all pyreon/padding-between-component-sections problems in this file')).toHaveLength(1)
  })

  it('returns nothing for a clean document or one the server never opened', async () => {
    _reloadConfig(getPreset(['recommended', 'readable']))
    const uri = 'file:///proj/src/clean.ts'
    await open(uri, 'export const x = 1\n')
    expect(await codeActions(uri)).toEqual([])
    expect(await codeActions('file:///proj/src/never-opened.ts')).toEqual([])
  })

  it('the pure core matches the RPC handler', () => {
    _reloadConfig(getPreset(['recommended', 'readable']))
    const actions = _computeCodeActions('file:///proj/src/D.tsx', SOURCE, undefined, [FIX_ALL_KIND])
    expect(actions).toHaveLength(1)
  })
})

describe('LSP uses the project’s own config', () => {
  const dirs: string[] = []
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })
  function project(config: object | null): string {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-lsp-cfg-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'package.json'), '{"name":"x"}')
    if (config) writeFileSync(join(dir, '.pyreonlintrc.json'), JSON.stringify(config))

    return dir
  }

  it('reads the nearest .pyreonlintrc.json for each document', async () => {
    // Regression: the server linted every document with a fixed `recommended`,
    // so a project's `readable` preset was invisible in the editor and
    // fix-on-save had nothing to apply.
    const withReadable = project({ preset: ['recommended', 'readable'] })
    const plain = project(null)
    const a = `file://${join(withReadable, 'Counter.tsx')}`
    const b = `file://${join(plain, 'Counter.tsx')}`
    await open(a, SOURCE)
    await open(b, SOURCE)
    expect((await codeActions(a, [FIX_ALL_KIND])).length).toBe(1)
    expect(await codeActions(b, [FIX_ALL_KIND])).toEqual([])
  })

  it('picks up an edit to the config file without a restart', async () => {
    const dir = project({ preset: ['recommended', 'readable'] })
    const file = join(dir, 'Counter.tsx')
    expect(_configFor(file).rules['pyreon/padding-before-return']).toBe('warn')
    writeFileSync(join(dir, '.pyreonlintrc.json'), JSON.stringify({ preset: 'recommended' }))
    // Make the mtime change observable even on a coarse-grained filesystem.
    const later = new Date(Date.now() + 5000)
    utimesSync(join(dir, '.pyreonlintrc.json'), later, later)
    expect(_configFor(file).rules['pyreon/padding-before-return']).toBe('off')
  })

  it('an invalid preset name falls back to the default instead of crashing', () => {
    const dir = project({ preset: 'nope' })
    expect(_configFor(join(dir, 'a.ts')).rules['pyreon/no-classname']).toBe('error')
  })
})

describe('LSP diagnostic ranges', () => {
  const diag = (start: number, end: number): Diagnostic => ({
    ruleId: 'x',
    severity: 'warn',
    message: 'm',
    span: { start, end },
    loc: { line: 0, column: 0 },
  })

  it('a finding in column 0 starts at character 0, not -1', () => {
    // Regression: the conversion subtracted 1 from an already 0-based column.
    const text = 'abc\ndef\n'
    const [d] = _toLspDiagnostics([diag(4, 7)], text)
    expect(d!.range).toEqual({ start: { line: 1, character: 0 }, end: { line: 1, character: 3 } })
  })

  it('a span crossing lines ends on its own last line', () => {
    const text = 'const a = {\n  x: 1,\n}\n'
    const [d] = _toLspDiagnostics([diag(10, 21)], text)
    expect(d!.range).toEqual({ start: { line: 0, character: 10 }, end: { line: 2, character: 1 } })
  })
})

describe('LSP framing', () => {
  const frame = (body: string) => `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`

  it('frames by BYTES, so a message with non-ASCII text is read whole', () => {
    // Regression: the reader sliced a decoded string by characters, so an em
    // dash made every following frame misaligned and both were dropped.
    const a = JSON.stringify({ jsonrpc: '2.0', method: 'x', params: { text: '// a — b →' } })
    const b = JSON.stringify({ jsonrpc: '2.0', method: 'y' })
    const { bodies, rest } = _takeFrames(Buffer.from(frame(a) + frame(b)))
    expect(bodies).toEqual([a, b])
    expect(rest.length).toBe(0)
  })

  it('keeps an incomplete frame for the next chunk, even split inside a multi-byte character', () => {
    const a = JSON.stringify({ jsonrpc: '2.0', method: 'x', params: { text: '→→→' } })
    const bytes = Buffer.from(frame(a))
    const cut = bytes.length - 4 // inside the last arrow
    const first = _takeFrames(bytes.subarray(0, cut))
    expect(first.bodies).toEqual([])
    const second = _takeFrames(Buffer.concat([first.rest, bytes.subarray(cut)]))
    expect(second.bodies).toEqual([a])
  })
})
