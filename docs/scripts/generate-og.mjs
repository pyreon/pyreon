#!/usr/bin/env bun
/**
 * Regenerate docs/public/og.png from docs/public/og.svg.
 *
 * Social platforms (Twitter/X, Facebook, LinkedIn, Slack, Discord,
 * iMessage) reject SVG og:images, so the social card MUST be a raster.
 * This renders og.svg in headless Chromium — with the brand Google Fonts
 * (Space Grotesk + JetBrains Mono) loaded so the text bakes correctly —
 * and screenshots it at exactly 1200x630.
 *
 * The SVG is inlined into the page (NOT loaded as <img>) so its
 * `<text font-family="Space Grotesk">` elements pick up the page-loaded
 * fonts; an <img>-loaded SVG is font-isolated and would fall back.
 *
 * Run after editing og.svg:
 *   bunx playwright install chromium   # one-time, if not already present
 *   bun docs/scripts/generate-og.mjs
 *
 * Requires `playwright` resolvable (it is a repo dev tool — run from a
 * workspace dir that has it, or `bun add -D playwright` first).
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PUBLIC = resolve(here, '../public')
const svg = readFileSync(resolve(PUBLIC, 'og.svg'), 'utf8')

const html = `<!DOCTYPE html><html><head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>*{margin:0;padding:0}html,body{width:1200px;height:630px;overflow:hidden}svg{display:block;width:1200px;height:630px}</style>
</head><body>${svg}</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.evaluate(async () => { await document.fonts.ready })
await page.waitForTimeout(400)
await page.screenshot({ path: resolve(PUBLIC, 'og.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } })
await browser.close()
process.stdout.write('✓ wrote docs/public/og.png (1200x630)\n')
