// The web-host page `<CodeWebView>` loads on native, built from the app's own CodeMirror.
//
// What this proves: the page BUNDLES from an isolated install (the package's regular dependencies resolve from the
// package, the optional grammar peers from the app), the bundle EXECUTES and assigns the `window.CM` contract the host
// bridge waits for, and the page carries the bridge. What it cannot prove — that the editor then takes edits through
// the bridge — is `webview.browser.test.tsx` (real Chromium) and the simulator/emulator run in examples/native-tasks.
import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { runInThisContext } from 'node:vm'
import { buildCodeHosts, codeHostEntry } from '../native-plugin/host'
import { CODE_HOST_FILENAME } from '../native-plugin/lowering'

const appDir = resolve(__dirname, '../..')

describe('code web-host entry', () => {
  it('assigns the window.CM contract and names only grammars that resolve', () => {
    const entry = codeHostEntry([appDir])
    expect(entry).toContain('window.CM = { EditorView, EditorState, Compartment, basicSetup, languageFor }')
    expect(entry).toContain("from '@codemirror/lang-javascript'")
    // A grammar the app does not have must not be imported — it would fail the whole bundle.
    expect(codeHostEntry(['/nonexistent-dir-for-pyreon-test'])).not.toContain('@codemirror/lang-')
  })
})

describe('code web-host page', () => {
  it('bundles, executes, and exposes the engine the bridge waits for', async () => {
    const files = await buildCodeHosts({ appDir })
    expect(files.map((f) => f.filename)).toEqual([CODE_HOST_FILENAME])
    const html = files[0]!.content
    // The bridge protocol: plain-prefix reverse messages, not a JSON envelope.
    expect(html).toContain("pyreonPostMessage('v:'")
    expect(html).toContain("pyreonPostMessage('e:'")
    // The engine is INLINED (self-contained, App-Store-safe): there is no external script to fetch.
    expect(html).not.toMatch(/<script src=/)
    expect(html.length).toBeGreaterThan(200_000)

    // Run just the engine script (the first inline <script>) and read what it assigned.
    const m = /<script>([\s\S]*?)<\/script><script>/.exec(html)
    expect(m, 'engine script precedes the bridge script').not.toBeNull()
    delete (globalThis as { CM?: unknown }).CM
    // Evaluated exactly as the browser sees it: the HTML parser does no unescaping inside <script>.
    runInThisContext(m![1]!)
    const CM = (globalThis as unknown as { CM: Record<string, unknown> }).CM
    expect(Object.keys(CM).sort()).toEqual(['Compartment', 'EditorState', 'EditorView', 'basicSetup', 'languageFor'])
    const languageFor = CM.languageFor as (n: string) => unknown
    expect(languageFor('typescript')).not.toEqual([])
    expect(languageFor('no-such-language')).toEqual([])
  }, 120_000)
})
