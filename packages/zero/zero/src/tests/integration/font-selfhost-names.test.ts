import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { fontPlugin } from '../../font'

// Google serves dynamically subset files at `…/l/font?kit=…`. Their last path
// segment is the bare word `font`, which used to become the self-hosted file
// name: every such file overwrote the previous one, and with no extension a
// static host routed `/assets/fonts/font` to a 404 page (the docs build's
// charts page failed its no-console-error check in CI on exactly this).
const KIT_A = 'https://fonts.gstatic.com/l/font?kit=AAA&skey=1'
const KIT_B = 'https://fonts.gstatic.com/l/font?kit=BBB&skey=2'
const CSS =
  `@font-face{font-family:"A";src:url(${KIT_A}) format('woff2');font-weight:400}` +
  `@font-face{font-family:"A";src:url(${KIT_A}) format('woff2');font-weight:700}` +
  `@font-face{font-family:"B";src:url(${KIT_B}) format('woff2');font-weight:400}`
const BYTES: Record<string, Uint8Array> = {
  [KIT_A]: new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0xa]),
  [KIT_B]: new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0xb]),
}

describe('self-hosted Google font file names through a real Vite build', () => {
  it('gives every `l/font?kit=` file its own name with an extension, downloading each once', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zero-font-names-'))
    writeFileSync(join(root, 'index.html'), '<html><head></head><body>x</body></html>')
    const fontRequests: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.startsWith('https://fonts.googleapis.com/')) return new Response(CSS)
      fontRequests.push(url)
      return new Response(BYTES[url] ?? new Uint8Array())
    })
    try {
      await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [fontPlugin({ google: ['A', 'B'], fallbackAdjust: false })],
        build: { outDir: join(root, 'dist'), emptyOutDir: true },
      })
      const files = readdirSync(join(root, 'dist/assets/fonts')).sort()
      expect(files).toHaveLength(2)
      for (const f of files) expect(f).toMatch(/^[0-9a-f]{16}\.woff2$/)
      // One download per distinct file, although KIT_A backs two weights.
      expect(fontRequests.sort()).toEqual([KIT_A, KIT_B])

      const html = readFileSync(join(root, 'dist/index.html'), 'utf8')
      expect(html).not.toContain('fonts.gstatic.com')
      for (const f of files) expect(html).toContain(`/assets/fonts/${f}`)
    } finally {
      vi.restoreAllMocks()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
