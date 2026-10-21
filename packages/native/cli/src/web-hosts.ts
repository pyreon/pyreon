// Package-owned web-host pages — the build step behind a lowered `<WebView src="…">`.
//
// A library whose engine is a WEB engine (CodeMirror, TipTap) crosses to native by hosting that engine in a
// WebView. The lowered `<WebView>` names a bundled page by filename, so something has to PRODUCE the page and put it
// where each runtime resolves `src`. The page cannot be produced by the compiler (it is the app's own installed
// engine plus the languages / extensions it chose) and cannot sit in the library tarball (it would ship in every
// web-only app). So the library's native plugin declares `webHosts`, and this step runs it.
//
// It only runs for plugins the app's source ACTIVATES (imports a module of), exactly like the compile step: an app
// that depends on `@pyreon/code` but never imports its webview bridge pays no half-megabyte bundle.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WebHostFile } from '@pyreon/native-compiler/plugin-api'
import { discoverPlugins } from './discover-plugins'
import {
  materializeAndroidWebHosts,
  materializeIosWebHosts,
  materializeWebWebHosts,
  type WebHostAsset,
  type WebHostMaterializeResult,
} from './web-assets'

export type WebHostTarget = 'ios' | 'android' | 'web'

/**
 * Build every web-host page the app's activated plugins declare. Two plugins producing one filename is an error naming
 * both — the lowered `src` is the only link between a page and its `<WebView>`, so a silent overwrite would point one
 * library's view at the other's engine.
 */
export async function buildPluginWebHosts(appDir: string, activationSource: string): Promise<WebHostFile[]> {
  const out: WebHostFile[] = []
  const owner = new Map<string, string>()
  for (const found of await discoverPlugins(appDir, activationSource)) {
    const build = found.plugin.webHosts
    if (build === undefined) continue
    for (const file of await build({ appDir })) {
      const existing = owner.get(file.filename)
      if (existing !== undefined) {
        throw new Error(
          `[Pyreon] web-host page "${file.filename}" is produced by both "${existing}" and "${found.package}". ` +
            `A lowered <WebView src> names a page by filename, so each filename needs exactly one owner.`,
        )
      }
      owner.set(file.filename, found.package)
      out.push(file)
    }
  }
  return out
}

/** Write built pages where the target's runtime resolves `<WebView src>`. */
export function materializeBuiltWebHosts(
  files: readonly WebHostFile[],
  target: WebHostTarget,
  outDir: string,
): WebHostMaterializeResult {
  if (files.length === 0) return { hosts: 0 }
  const staging = mkdtempSync(join(tmpdir(), 'pyreon-webhost-'))
  try {
    const assets: WebHostAsset[] = files.map((f) => {
      const file = join(staging, f.filename)
      writeFileSync(file, f.content)
      return { filename: f.filename, file }
    })
    if (target === 'ios') return materializeIosWebHosts(assets, outDir)
    if (target === 'android') return materializeAndroidWebHosts(assets, outDir)
    return materializeWebWebHosts(assets, outDir)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
