/**
 * Import + invoke a single emitted SSR serverless function in an ISOLATED
 * process, then assert it server-renders a hydration-ready page. Run as a
 * subprocess by `scripts/verify-modes.ts` (assertSsrFunctionRenders) — one
 * process PER function so each bundle's `registerSingleton` sees a single
 * instance (mirrors real deploys, where every function runs in its own
 * isolate; loading several in one process would correctly trip the
 * duplicate-`@pyreon/server` sentinel).
 *
 * Usage: node scripts/_invoke-ssr-function.mjs <absoluteFuncPath> <style>
 *   style ∈ vercel | netlify | cloudflare | node
 * Exits 0 on success; non-zero (with the failing checks on stderr) otherwise.
 */
import { pathToFileURL } from 'node:url'

const [, , funcPath, style] = process.argv
if (!funcPath || !style) {
  console.error('usage: _invoke-ssr-function.mjs <funcPath> <style>')
  process.exit(2)
}

const mod = await import(pathToFileURL(funcPath).href)
const req = new Request('http://localhost/posts')

let res
if (style === 'cloudflare') {
  res = await mod.default.fetch(req, {}, {})
} else if (style === 'netlify') {
  res = await mod.default(req, {})
} else {
  // vercel / node — default export is the (req) => Response handler.
  res = await mod.default(req)
}

const html = await res.text()
const checks = {
  status200: res.status === 200,
  routerView: html.includes('data-pyreon-router-view'),
  loaderData: html.includes('__PYREON_LOADER_DATA__'),
  noUnfilledShell: !html.includes('<!--pyreon-app-->'),
  hashedClientEntry: /\/assets\/index-[\w.-]+\.js/.test(html),
  noDevEntry: !html.includes('/src/entry-client.ts'),
}
const failed = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([k]) => k)

if (failed.length > 0) {
  console.error(`[${style}] SSR function render FAILED: ${failed.join(', ')} (status ${res.status})`)
  process.exit(1)
}
// Success is signalled by exit 0 (the caller checks the status code); no
// stdout needed (and the lint config permits only console.warn/error).
process.exit(0)
