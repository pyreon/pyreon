// The web-host page `<RichTextWebView>` loads on native, built from the app's own TipTap.
//
// What this proves: the page BUNDLES from an isolated install, the bundle EXECUTES and assigns the `window.TT` factory
// the host bridge waits for, and the page carries the plain-prefix bridge. That the editor then takes edits through the
// bridge is `webview.browser.test.tsx` (real Chromium) and the simulator / emulator run in examples/native-tasks.
import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { runInThisContext } from 'node:vm'
import { RICH_TEXT_HOST_ENTRY, buildRichTextHosts } from '../native-plugin/host'
import { RICH_TEXT_HOST_FILENAME } from '../native-plugin/lowering'

const appDir = resolve(__dirname, '../..')

describe('rich-text web-host entry', () => {
  it('pushes content without emitting an update, so a pushed value never echoes back as an edit', () => {
    expect(RICH_TEXT_HOST_ENTRY).toContain('emitUpdate: false')
    expect(RICH_TEXT_HOST_ENTRY).toContain('window.TT = {')
  })
})

describe('rich-text web-host page', () => {
  it('bundles, executes, and exposes the factory the bridge waits for', async () => {
    const files = await buildRichTextHosts({ appDir })
    expect(files.map((f) => f.filename)).toEqual([RICH_TEXT_HOST_FILENAME])
    const html = files[0]!.content
    expect(html).toContain("pyreonPostMessage('c:'")
    expect(html).toContain("pyreonPostMessage('e:'")
    expect(html).not.toMatch(/<script src=/)
    expect(html.length).toBeGreaterThan(200_000)

    const m = /<script>([\s\S]*?)<\/script><script>/.exec(html)
    expect(m, 'engine script precedes the bridge script').not.toBeNull()
    delete (globalThis as { TT?: unknown }).TT
    // Evaluated exactly as the browser sees it: the HTML parser does no unescaping inside <script>.
    runInThisContext(m![1]!)
    const TT = (globalThis as unknown as { TT: { createEditor: unknown } }).TT
    expect(typeof TT.createEditor).toBe('function')
  }, 120_000)
})
