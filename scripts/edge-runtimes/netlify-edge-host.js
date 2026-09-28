// Netlify Edge Functions host — runs under REAL Deno (the runtime Netlify
// Edge Functions execute on). Usage:
//
//   deno run --allow-net --allow-read --allow-env netlify-edge-host.js <dist> <port>
//
// It imports the edge function zero's netlifyAdapter emitted, UNCHANGED, and
// applies Netlify's documented request order for it:
//   1. an edge function whose `config.pattern` matches (and whose
//      `excludedPattern` does not) runs FIRST — before static files;
//      `context.next()` (or returning undefined) continues down the chain;
//   2. otherwise the file from the publish dir is served;
//   3. otherwise 404 (the Node function is out of scope for an edge smoke).
// The request routing is emulated; the runtime executing zero's code is real.
const [dist, portArg] = Deno.args
const root = new URL(`file://${dist.endsWith('/') ? dist : `${dist}/`}`)
const toml = await Deno.readTextFile(new URL('netlify.toml', root))
const setting = (key) => toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1]
const publish = new URL(`${setting('publish')}/`, root)
const edgeDir = new URL(`${setting('edge_functions')}/`, root)

const fns = []
for await (const entry of Deno.readDir(edgeDir)) {
  if (!entry.isDirectory) continue
  const mod = await import(new URL(`${entry.name}/${entry.name}.js`, edgeDir).href)
  const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).map((p) => new RegExp(p))
  fns.push({ name: entry.name, run: mod.default, pattern: list(mod.config?.pattern), excluded: list(mod.config?.excludedPattern) })
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain', '.json': 'application/json', '.svg': 'image/svg+xml' }
async function serveStatic(pathname) {
  const candidates = pathname.endsWith('/') ? [`${pathname}index.html`] : [pathname, `${pathname}/index.html`]
  for (const p of candidates) {
    const file = new URL(`.${decodeURIComponent(p)}`, publish)
    if (!file.href.startsWith(publish.href)) return new Response('Forbidden', { status: 403 })
    try {
      const body = await Deno.readFile(file)
      const ext = p.slice(p.lastIndexOf('.'))
      return new Response(body, { headers: { 'content-type': MIME[ext] ?? 'application/octet-stream', 'x-served-by': 'netlify-static' } })
    } catch {}
  }
  return undefined
}

Deno.serve({ port: Number(portArg) }, async (request) => {
  const { pathname } = new URL(request.url)
  const next = async () => (await serveStatic(pathname)) ?? new Response('Not Found', { status: 404 })
  for (const fn of fns) {
    if (!fn.pattern.some((re) => re.test(pathname)) || fn.excluded.some((re) => re.test(pathname))) continue
    const res = await fn.run(request, { next, geo: {}, ip: '127.0.0.1', requestId: crypto.randomUUID(), site: {}, deploy: {}, server: { region: 'local' } })
    if (res instanceof Response) {
      const headers = new Headers(res.headers)
      headers.set('x-served-by', `netlify-edge:${fn.name}`)
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
    }
  }
  return next()
})
