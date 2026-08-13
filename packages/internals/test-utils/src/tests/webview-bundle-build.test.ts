// Verifies the WebView-host bundle pipeline: `buildWebHostBundle` esbuilds a
// package's `webview-entry` into a self-contained HTML page that hosts the web
// engine 1:1 inside a `<WebView>` (WKWebView / Android WebView / iframe). Uses
// @pyreon/rich-text (a ProseMirror editor — the canonical un-portable web
// engine) as the reference: the bundle must carry the editor AND the
// connectWebHost bridge, with everything inlined (no external script/link).
//
// Bundles the BUILT lib/, so it needs a bootstrap first (lib-needing test).

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildWebHostBundle } from '../../../../../scripts/build-webview-bundle'

// vitest runs from the package dir (packages/internals/test-utils) → repo root
// is three levels up.
const REPO_ROOT = resolve(process.cwd(), '../../..')
const RICH_TEXT_ENTRY = resolve(REPO_ROOT, 'packages/fundamentals/rich-text/src/webview-entry.ts')
// This bundles against the BUILT lib/ — skip (not fail) when it isn't bootstrapped.
const LIB_BUILT = existsSync(resolve(REPO_ROOT, 'packages/fundamentals/rich-text/lib/index.js'))

describe('WebView-host bundle pipeline', () => {
  it.skipIf(!LIB_BUILT)('bundles @pyreon/rich-text into a self-contained hostable page', async () => {
    const html = await buildWebHostBundle({ entry: RICH_TEXT_ENTRY, title: 'RichText' })

    // A complete document with the mount root the entry renders into.
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain('<title>RichText</title>')

    // The real editor engine is bundled in.
    expect(/prosemirror/i.test(html)).toBe(true)

    // The guest side of the bridge is wired (connectWebHost reads __pyreonData
    // and sends via pyreonPostMessage).
    expect(html.includes('__pyreonData') || html.includes('pyreonPostMessage')).toBe(true)

    // Self-contained — no external script/link (WKWebView loadHTMLString safe).
    expect(html).not.toMatch(/<script[^>]+src=/)
    expect(html).not.toMatch(/<link/)
  }, 60_000)
})
