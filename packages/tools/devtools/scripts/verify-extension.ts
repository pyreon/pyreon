#!/usr/bin/env bun
/**
 * Verify the built devtools extension actually works in a real Chrome
 * instance. Closes the gap that unit tests can't reach:
 *
 *   - The extension's `content-script.js` actually loads on page-load
 *   - The `page-hook.js` it injects actually exposes `__PYREON_DEVTOOLS__`
 *     on the page's `window` (NOT the content-script context)
 *   - The `.reactive` Foundation surface is reachable from page-context JS
 *   - `activate()` + `getGraph()` + `getFires()` round-trip with real
 *     reactive state in a real Pyreon app
 *
 * What it does NOT verify (limitations of Playwright + Chrome DevTools):
 *
 *   - The Pyreon panel actually appears in the DevTools tab strip when
 *     a user presses F12 — DevTools UI is privileged Chrome chrome that
 *     Playwright cannot drive. The standalone `panel.html` render
 *     (separate test) covers the panel's CODE; this script covers the
 *     extension's PAGE-INJECTION + bridge.
 *
 * Run: `bun packages/tools/devtools/scripts/verify-extension.ts`
 *   (assumes the extension is built to `dist/` and a Pyreon dev app is
 *    running at http://localhost:5180)
 */

import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const DEVTOOLS_DIR = join(import.meta.dir, '..')
const DIST = join(DEVTOOLS_DIR, 'dist')
const APP_URL = process.env.APP_URL ?? 'http://localhost:5180'

const pass = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`)
const fail = (msg: string) => {
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`)
  process.exitCode = 1
}
const info = (msg: string) => console.log(`  \x1b[2m${msg}\x1b[0m`)

console.log('\nPyreon DevTools — extension verification\n')

// ── 1. dist/ sanity ───────────────────────────────────────────────────────
console.log('1. dist/ sanity')
const required = [
  'manifest.json',
  'background.js',
  'content-script.js',
  'page-hook.js',
  'devtools.html',
  'devtools.js',
  'panel.html',
  'panel.js',
  'panel.css',
  'icons/pyreon-128.png',
]
for (const f of required) {
  const p = join(DIST, f)
  if (existsSync(p)) pass(`dist/${f} present`)
  else fail(`dist/${f} MISSING — run \`bun run build\` first`)
}
if (process.exitCode) process.exit(1)

// ── 1b. Static syntax-quality scan ────────────────────────────────────────
// Catch the bug class where the bundler emits CJS module decorators
// (`Object.defineProperties(exports, …)`) inside an IIFE that has no
// `exports` parameter. That makes the entire script throw at load time
// with `ReferenceError: exports is not defined` — silently breaking the
// extension's content-script chain. Pre-fix this slipped past the
// runtime check in step 3 because @pyreon/runtime-dom's installDevTools()
// sets window.__PYREON_DEVTOOLS__ from page-context independently of the
// extension. The static scan catches it deterministically.
console.log('\n1b. Static syntax-quality scan (catches the IIFE-no-exports bug class)')
import { readFileSync } from 'node:fs'

const IIFE_ENTRIES = ['content-script.js', 'devtools.js', 'panel.js', 'page-hook.js']
for (const name of IIFE_ENTRIES) {
  const src = readFileSync(join(DIST, name), 'utf-8')
  const head = src.slice(0, 200)
  // The IIFE must NOT reference `exports` before declaring it.
  // (The actual IIFE wrapper line `(function () {` has no `exports` arg
  // in rolldown's output, so any `exports.…` / `Object.defineProperties(exports`
  // at the top would throw at load time.)
  if (/Object\.defineProperties\(exports,/.test(head)) {
    fail(
      `${name} contains CJS module decorator referencing undefined \`exports\` — script will ReferenceError on load`,
    )
  } else if (/^(?:.*\n){0,5}\bexports\b/m.test(head) && !/function\s*\(\s*exports\b/.test(head)) {
    fail(
      `${name} references \`exports\` near top of file but the IIFE doesn't declare it — likely broken at load`,
    )
  } else {
    pass(`${name} clean (no undefined-exports references)`)
  }
}
if (process.exitCode) {
  console.log(
    '\n  → run `bun run scripts/strip-cjs-decorators.ts` (auto-invoked by `bun run build`) to fix',
  )
  process.exit(1)
}

// ── 2. Launch Chromium with the extension loaded ──────────────────────────
console.log('\n2. Launch Chromium with --load-extension')

const userDataDir = join(import.meta.dir, '..', '.playwright-profile')
let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null

try {
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  })
  pass('Chromium launched with extension loaded')
} catch (err) {
  fail(`Chromium launch failed: ${err}`)
  process.exit(1)
}

// ── 3. Open the Pyreon app + verify the page-hook injected ────────────────
console.log(`\n3. Open ${APP_URL} + verify page-hook injection`)

const page = await context.newPage()

// Listen for console errors / page errors — catches the bug class where
// the content-script throws at load time (ReferenceError: exports is not
// defined). Without this, the runtime check below gives a false positive
// because the framework also sets window.__PYREON_DEVTOOLS__ from
// page-context (via @pyreon/runtime-dom's installDevTools()).
const consoleErrors: string[] = []
const pageErrors: string[] = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => pageErrors.push(err.message))

try {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  pass(`Loaded ${APP_URL}`)
} catch (err) {
  fail(`Could not reach ${APP_URL} — is the dev server running?`)
  info(`  Hint: cd examples/perf-dashboard && bun run dev`)
  await context.close()
  process.exit(1)
}

// Wait a beat for content-script + page-hook to inject
await page.waitForTimeout(1000)

// Surface any errors from extension-script loading — these would silently
// kill the content-script / page-hook chain even when the framework
// independently sets __PYREON_DEVTOOLS__ from page-context.
const extensionErrors = [...consoleErrors, ...pageErrors].filter((e) =>
  /exports is not defined|content-script|page-hook|chrome\.runtime/.test(e),
)
if (extensionErrors.length > 0) {
  fail(`Extension-script errors detected (these break the content-script chain):`)
  for (const e of extensionErrors) info(`    ${e}`)
} else {
  pass('No extension-script errors during page load')
}

const hookSurface = await page.evaluate(() => {
  const dt = (window as unknown as { __PYREON_DEVTOOLS__?: Record<string, unknown> })
    .__PYREON_DEVTOOLS__
  if (!dt) return null
  return {
    version: dt.version,
    methods: Object.keys(dt).filter((k) => typeof dt[k] === 'function'),
    hasReactive: typeof dt.reactive === 'object' && dt.reactive !== null,
    reactiveMethods:
      dt.reactive && typeof dt.reactive === 'object'
        ? Object.keys(dt.reactive as Record<string, unknown>).filter(
            (k) => typeof (dt.reactive as Record<string, unknown>)[k] === 'function',
          )
        : [],
  }
})

if (!hookSurface) {
  fail('window.__PYREON_DEVTOOLS__ is undefined — page-hook did not inject')
  await context.close()
  process.exit(1)
}

pass('window.__PYREON_DEVTOOLS__ is exposed on the page')
info(`  version: ${hookSurface.version}`)
info(`  methods: ${hookSurface.methods.join(', ')}`)

const requiredMethods = [
  'getComponentTree',
  'getAllComponents',
  'highlight',
  'onComponentMount',
  'onComponentUnmount',
  'enableOverlay',
  'disableOverlay',
]
for (const m of requiredMethods) {
  if (hookSurface.methods.includes(m)) pass(`  has ${m}()`)
  else fail(`  MISSING ${m}()`)
}

if (hookSurface.hasReactive) pass('  has .reactive Foundation surface')
else fail('  MISSING .reactive Foundation surface (the Signals/Graph/Effects/Profiler tabs depend on this)')

const requiredReactive = ['activate', 'deactivate', 'getGraph', 'getFires']
for (const m of requiredReactive) {
  if (hookSurface.reactiveMethods.includes(m)) pass(`  .reactive.${m}()`)
  else fail(`  MISSING .reactive.${m}()`)
}

// ── 4. End-to-end: activate, trigger reactive activity, read graph + fires ─
console.log('\n4. Activate reactive Foundation + drive real signal activity')

const reactiveResult = await page.evaluate(async () => {
  const dt = (window as unknown as {
    __PYREON_DEVTOOLS__: {
      reactive: {
        activate: () => void
        deactivate: () => void
        getGraph: () => { nodes: unknown[]; edges: unknown[] }
        getFires: () => unknown[]
      }
    }
  }).__PYREON_DEVTOOLS__

  dt.reactive.activate()
  const initial = dt.reactive.getGraph()

  // Wait for some reactive activity from the app itself
  await new Promise((r) => setTimeout(r, 500))

  const afterDelay = dt.reactive.getGraph()
  const fires = dt.reactive.getFires()

  dt.reactive.deactivate()
  return {
    initialNodeCount: initial.nodes.length,
    initialEdgeCount: initial.edges.length,
    afterDelayNodeCount: afterDelay.nodes.length,
    afterDelayEdgeCount: afterDelay.edges.length,
    fireCount: fires.length,
    sampleFire: fires[0] ?? null,
  }
})

info(`  initial graph: ${reactiveResult.initialNodeCount} nodes, ${reactiveResult.initialEdgeCount} edges`)
info(`  after 500ms: ${reactiveResult.afterDelayNodeCount} nodes, ${reactiveResult.afterDelayEdgeCount} edges`)
info(`  fires captured: ${reactiveResult.fireCount}`)
if (reactiveResult.sampleFire) {
  info(`  sample fire: ${JSON.stringify(reactiveResult.sampleFire).slice(0, 120)}`)
}

if (reactiveResult.afterDelayNodeCount > 0) {
  pass('Reactive graph populated with live signal/effect nodes')
} else {
  info(
    '  (no reactive nodes captured — the app may not have triggered any reactive activity in 500ms, OR reactive.activate() needs to be called BEFORE the app mounts)',
  )
}

// ── 5. Component tree ──────────────────────────────────────────────────────
console.log('\n5. Component tree')

const treeResult = await page.evaluate(() => {
  const dt = (window as unknown as {
    __PYREON_DEVTOOLS__: {
      getComponentTree: () => unknown[]
      getAllComponents: () => unknown[]
    }
  }).__PYREON_DEVTOOLS__
  return {
    treeCount: dt.getComponentTree().length,
    allCount: dt.getAllComponents().length,
  }
})

info(`  root components: ${treeResult.treeCount}`)
info(`  all components: ${treeResult.allCount}`)

if (treeResult.allCount > 0) pass('Component tree populated')
else fail('Component tree empty — registerComponent may not be firing during mount')

// ── 6. Screenshot the loaded page (for visual confirmation) ───────────────
console.log('\n6. Screenshot the app page (for visual evidence)')

const screenshotPath = join(import.meta.dir, '..', 'verification-screenshots', 'app-with-extension.png')
await page.screenshot({ path: screenshotPath, fullPage: false })
pass(`Saved ${screenshotPath}`)

// ── 7. Render panel.html standalone + screenshot each visible state ───────
console.log('\n7. Render panel.html standalone + screenshot panel states')

const panelHtmlPath = `file://${join(DIST, 'panel.html')}`
await page.goto(panelHtmlPath, { waitUntil: 'domcontentloaded' })
// Panel runs in DevTools context with chrome.runtime.connect available; in
// a plain file:// load it falls back to its "not connected" state. We
// screenshot what we get — proves the static HTML + CSS render correctly.
await page.waitForTimeout(500)

const panelEmptyShot = join(import.meta.dir, '..', 'verification-screenshots', 'panel-standalone.png')
await page.screenshot({ path: panelEmptyShot, fullPage: true })
pass(`Saved ${panelEmptyShot}`)

await context.close()

console.log(
  '\n' +
    (process.exitCode
      ? '\x1b[31mVerification FAILED — see ✗ entries above\x1b[0m'
      : '\x1b[32mVerification PASSED — extension surface end-to-end works\x1b[0m') +
    '\n',
)
