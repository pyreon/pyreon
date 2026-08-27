// Web-host assets — the `.html` / `.js` / `.css` files a `<WebView src="…">`
// loads out of the app bundle.
//
// `@pyreon/primitives`' `<WebView>` accepts `src` as a BUNDLED file name, and
// both runtimes have always resolved it that way: `Bundle.main` on iOS,
// `file:///android_asset/<src>` on Android. Nothing could put a file THERE —
// the assets pipeline handled images and fonts only. So the runtimes advertised
// a capability the build had no way to feed, and every `<WebView>` in shared
// source had to inline its whole page as a string.
//
// That matters for the four webview-hosted packages (charts / code / flow /
// rich-text): their host page is produced at BUILD time (`buildChartHostHtml`
// and friends), so it cannot appear in lowered source. A bundled file is the
// only route they have.
//
// Deliberately NOT part of the image/font scan: those key on a NAME (scale
// variants collapse into one asset, Android sanitizes identifiers). A web host
// is loaded by its exact filename — `src="chart.html"` must find `chart.html` —
// so the filename is the contract and must survive verbatim on every target.

import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Extensions carried verbatim into the bundle for `<WebView src>` to load. */
const WEB_HOST_EXTS = new Set(['html', 'js', 'css'])

export interface WebHostAsset {
  /** Exact filename, which IS the `src` contract. */
  filename: string
  /** Absolute source path. */
  file: string
}

export interface WebHostMaterializeResult {
  hosts: number
}

/**
 * Collect web-host files from an assets directory.
 *
 * Looks in `<dir>/webhost` rather than `<dir>` itself, so adding one cannot
 * change how an existing image or font is classified — a silent reclassification
 * of assets that already ship is a worse failure than not finding a new file.
 */
export function scanWebHostDir(dir: string): WebHostAsset[] {
  const hostDir = join(dir, 'webhost')
  let entries: string[]
  try {
    if (!statSync(hostDir).isDirectory()) return []
    entries = readdirSync(hostDir).sort()
  } catch {
    return []
  }
  const out: WebHostAsset[] = []
  for (const entry of entries) {
    const full = join(hostDir, entry)
    if (!statSync(full).isFile()) continue
    const ext = entry.replace(/^.+\./, '').toLowerCase()
    if (!WEB_HOST_EXTS.has(ext)) continue
    out.push({ filename: entry, file: full })
  }
  return out
}

/**
 * iOS: flat into the resource root, because `Bundle.main.url(forResource:)` —
 * which is how `PyreonWebView(src:)` resolves — looks there.
 */
export function materializeIosWebHosts(
  hosts: WebHostAsset[],
  outDir: string,
): WebHostMaterializeResult {
  if (hosts.length === 0) return { hosts: 0 }
  const dir = join(outDir, 'webhost')
  mkdirSync(dir, { recursive: true })
  for (const h of hosts) copyFileSync(h.file, join(dir, h.filename))
  return { hosts: hosts.length }
}

/**
 * Android: `assets/`, which is exactly what `file:///android_asset/<name>`
 * reads. NOT `res/`, whose identifiers are sanitized — that would rename the
 * file out from under the `src` that names it.
 */
export function materializeAndroidWebHosts(
  hosts: WebHostAsset[],
  outDir: string,
): WebHostMaterializeResult {
  if (hosts.length === 0) return { hosts: 0 }
  const dir = join(outDir, 'assets')
  mkdirSync(dir, { recursive: true })
  for (const h of hosts) copyFileSync(h.file, join(dir, h.filename))
  return { hosts: hosts.length }
}

/** Web: the served root, so an `<iframe src>` resolves the same name. */
export function materializeWebWebHosts(
  hosts: WebHostAsset[],
  outDir: string,
): WebHostMaterializeResult {
  if (hosts.length === 0) return { hosts: 0 }
  mkdirSync(outDir, { recursive: true })
  for (const h of hosts) copyFileSync(h.file, join(outDir, h.filename))
  return { hosts: hosts.length }
}
