import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  materializeAndroidWebHosts,
  materializeIosWebHosts,
  materializeWebWebHosts,
  scanWebHostDir,
} from '../web-assets'

/**
 * `<WebView src="page.html">` loads a BUNDLED file — `Bundle.main` on iOS,
 * `file:///android_asset/<src>` on Android. Both runtimes have always resolved
 * it that way and nothing could put a file there: the assets pipeline handled
 * images and fonts only. So the runtimes advertised a capability the build had
 * no way to feed, and every `<WebView>` in shared source had to inline its whole
 * page as a string.
 *
 * That is what blocks the four webview-hosted packages (charts / code / flow /
 * rich-text): their host page is produced at BUILD time, so it cannot appear in
 * lowered source. A bundled file is their only route.
 */
const fixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-webhost-'))
  const host = join(dir, 'webhost')
  mkdirSync(host, { recursive: true })
  writeFileSync(join(host, 'chart.html'), '<!doctype html>')
  writeFileSync(join(host, 'chart.js'), '// x')
  writeFileSync(join(host, 'notes.txt'), 'ignored')
  return dir
}

describe('web-host assets', () => {
  it('collects only the extensions a WebView can load', () => {
    expect(scanWebHostDir(fixture()).map((h) => h.filename)).toEqual(['chart.html', 'chart.js'])
  })

  it('is absent-safe — no webhost/ directory is not an error', () => {
    expect(scanWebHostDir(mkdtempSync(join(tmpdir(), 'pyreon-empty-')))).toEqual([])
  })

  // The filename IS the contract: `src="chart.html"` must find `chart.html`.
  // Images and fonts key on a NAME and get sanitized or scale-collapsed; doing
  // that here would rename the file out from under the `src` that names it.
  it('preserves the exact filename on every target', () => {
    const hosts = scanWebHostDir(fixture())
    for (const [materialize, sub] of [
      [materializeIosWebHosts, 'webhost'],
      [materializeAndroidWebHosts, 'assets'],
      [materializeWebWebHosts, ''],
    ] as const) {
      const out = mkdtempSync(join(tmpdir(), 'pyreon-out-'))
      const r = materialize(hosts, out)
      expect(r.hosts).toBe(2)
      expect(readdirSync(sub === '' ? out : join(out, sub)).sort()).toEqual([
        'chart.html',
        'chart.js',
      ])
    }
  })

  it('writes nothing at all when there are no hosts', () => {
    const out = mkdtempSync(join(tmpdir(), 'pyreon-none-'))
    expect(materializeAndroidWebHosts([], out).hosts).toBe(0)
    expect(readdirSync(out)).toEqual([])
  })
})
