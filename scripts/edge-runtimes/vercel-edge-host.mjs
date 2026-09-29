// Vercel Edge host — runs a `.vercel/output` (Build Output API v3) tree with
// its EDGE functions executed in Vercel's own Edge Runtime sandbox
// (`edge-runtime`, the VM `vercel dev` and Next.js use for edge code): no
// `process`, no `require`, no filesystem, no `import.meta.url`, Web APIs only.
//
//   node vercel-edge-host.mjs <projectRoot> <port> <toolsDir>
//
// Each edge function directory is bundled the way Vercel bundles it at deploy
// time (esbuild, one script; `node:async_hooks` — one of the Node modules
// Vercel Edge supports — backed by AsyncLocalStorage, as Vercel provides it).
// `config.json` routes are applied per the Build Output API: `src` regex
// (anchored), `headers`, `dest` rewrite with `$n` groups, `continue`, and the
// `{ handle: 'filesystem' }` phase. A Node (non-edge) function answers 501 —
// this host exists to prove the EDGE path.
import { AsyncLocalStorage } from 'node:async_hooks'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'

const [projectRoot, portArg, toolsDir] = process.argv.slice(2)
const out = resolve(projectRoot, '.vercel/output')
const requireTool = createRequire(join(toolsDir, 'node_modules/'))
const { EdgeRuntime } = requireTool('edge-runtime')
const esbuild = createRequire(import.meta.url)('esbuild')
const config = JSON.parse(readFileSync(join(out, 'config.json'), 'utf8'))

const runtimes = new Map()
async function edgeFunction(name) {
  if (runtimes.has(name)) return runtimes.get(name)
  const dir = join(out, 'functions', `${name}.func`)
  const vc = JSON.parse(readFileSync(join(dir, '.vc-config.json'), 'utf8'))
  if (vc.runtime !== 'edge') return null
  const built = await esbuild.build({
    stdin: {
      contents: `import handler from ${JSON.stringify(`./${vc.entrypoint}`)}
addEventListener('fetch', (event) => event.respondWith(handler(event.request)))`,
      resolveDir: dir,
    },
    bundle: true,
    format: 'iife',
    platform: 'neutral',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'vercel-edge-node-modules',
        setup(b) {
          b.onResolve({ filter: /^node:async_hooks$/ }, () => ({ path: 'async_hooks', namespace: 'vercel-edge' }))
          b.onLoad({ filter: /.*/, namespace: 'vercel-edge' }, () => ({
            contents: 'export const AsyncLocalStorage = globalThis.AsyncLocalStorage',
          }))
        },
      },
    ],
  })
  const runtime = new EdgeRuntime({
    initialCode: built.outputFiles[0].text,
    extend: (ctx) => Object.assign(ctx, { AsyncLocalStorage }),
  })
  runtimes.set(name, runtime)
  return runtime
}

function staticFile(pathname) {
  const clean = decodeURIComponent(pathname)
  for (const p of clean.endsWith('/') ? [`${clean}index.html`] : [clean, `${clean}/index.html`]) {
    const file = resolve(out, 'static', `.${p}`)
    if (!file.startsWith(join(out, 'static'))) return undefined
    if (existsSync(file) && statSync(file).isFile()) return file
  }
  return undefined
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain', '.json': 'application/json', '.svg': 'image/svg+xml' }

async function route(request) {
  const url = new URL(request.url)
  let path = url.pathname
  const headers = {}
  const serveFs = () => {
    const file = staticFile(path)
    if (!file) return undefined
    const ext = file.slice(file.lastIndexOf('.'))
    return new Response(readFileSync(file), {
      headers: { 'content-type': MIME[ext] ?? 'application/octet-stream', 'x-served-by': 'vercel-static', ...headers },
    })
  }
  const invoke = async (dest) => {
    const fn = dest.replace(/^\//, '')
    if (!existsSync(join(out, 'functions', `${fn}.func`))) return undefined
    const runtime = await edgeFunction(fn)
    if (!runtime) return new Response(`node function ${fn} is not run by the edge host`, { status: 501 })
    const res = await runtime.dispatchFetch(request.url, {
      method: request.method,
      headers: Object.fromEntries(request.headers),
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
    })
    await res.waitUntil()
    const h = new Headers()
    res.headers.forEach((v, k) => h.set(k, v))
    for (const [k, v] of Object.entries(headers)) h.set(k, v)
    h.set('x-served-by', `vercel-edge:${fn}`)
    return new Response(res.body ? Readable.toWeb(Readable.from(res.body)) : null, { status: res.status, headers: h })
  }
  for (const r of config.routes ?? []) {
    if (r.handle === 'filesystem') {
      const hit = serveFs()
      if (hit) return hit
      continue
    }
    if (r.handle) continue
    const m = new RegExp(`^${r.src}$`).exec(path)
    if (!m) continue
    Object.assign(headers, r.headers ?? {})
    if (r.dest) path = r.dest.replace(/\$(\d+)/g, (_, i) => m[Number(i)] ?? '')
    if (r.continue) continue
    return (await invoke(path)) ?? serveFs() ?? new Response('Not Found', { status: 404 })
  }
  return serveFs() ?? new Response('Not Found', { status: 404 })
}

createServer(async (req, res) => {
  try {
    const request = new Request(new URL(req.url, `http://${req.headers.host}`), {
      method: req.method,
      headers: req.headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req),
      duplex: 'half',
    })
    const response = await route(request)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) for await (const chunk of response.body) res.write(chunk)
    res.end()
  } catch (err) {
    console.error('[vercel-edge-host]', err)
    res.writeHead(500).end(String(err))
  }
}).listen(Number(portArg), () => console.log(`vercel edge host on http://localhost:${portArg}`))
