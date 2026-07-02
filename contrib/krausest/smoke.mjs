import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { chromium } from 'playwright'

// usage: bun contrib/krausest/smoke.mjs [dir-with-built-dist]  (defaults to ./pyreon-keyed)
const root = process.argv[2] ?? new URL('./pyreon-keyed', import.meta.url).pathname
const resolvedRoot = resolve(root)
const server = createServer((req, res) => {
  // Containment check (CodeQL js/path-injection): the joined path must stay
  // inside the served root — separator-terminated prefix test, same pattern
  // as ssg-plugin's isInsideDist. Localhost-only harness, but correct anyway.
  const p = resolve(join(resolvedRoot, req.url === '/' ? 'index.html' : req.url.split('?')[0]))
  if (p !== resolvedRoot && !p.startsWith(resolvedRoot + sep)) {
    res.writeHead(403)
    res.end()
    return
  }
  if (!existsSync(p)) { res.writeHead(404); res.end(); return }
  const type = p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'text/plain'
  res.writeHead(200, { 'content-type': type })
  res.end(readFileSync(p))
})
await new Promise((r) => server.listen(4599, r))

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:4599/')

const rows = () => page.locator('table.test-data tbody tr').count()
const assert = (c, msg) => { if (!c) throw new Error('FAIL: ' + msg) }

await page.click('#run')
assert((await rows()) === 1000, 'create 1000')
const firstLabel = await page.locator('tbody tr:first-child td.col-md-4 a').textContent()

await page.click('#update')
const updated = await page.locator('tbody tr:first-child td.col-md-4 a').textContent()
assert(updated === firstLabel + ' !!!', 'update every 10th appends !!!')

const id2before = await page.locator('tbody tr:nth-child(2) td:first-child').textContent()
await page.click('#swaprows')
const id2after = await page.locator('tbody tr:nth-child(2) td:first-child').textContent()
assert(id2before !== id2after, 'swap changed row 2')

await page.locator('tbody tr:nth-child(3) td.col-md-4 a').evaluate((el) => el.click())
assert(await page.locator('tbody tr:nth-child(3)').evaluate((el) => el.classList.contains('danger')), 'selection applies danger class')

// no bootstrap css in this harness → the glyphicon <a> is zero-size; dispatch a real bubbling click
await page.locator('tbody tr:nth-child(3) a:has(span.glyphicon)').evaluate((el) => el.click())
assert((await rows()) === 999, 'remove drops one row')

await page.click('#add')
assert((await rows()) === 1999, 'append 1000')

await page.click('#runlots')
assert((await rows()) === 10000, 'create 10k')

await page.click('#clear')
assert((await rows()) === 0, 'clear')

assert(errors.length === 0, 'no page errors: ' + errors.join('; '))
console.log('SMOKE OK — all 8 ops verified, no console errors')
await browser.close()
server.close()
