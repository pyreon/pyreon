/**
 * A4 — run and validate zero's adapter output the way the PLATFORM will,
 * not the way Node in this repo happens to.
 *
 * Three things `assertSsrFunctionRenders` (node-invoke inside the example
 * directory) cannot see:
 *
 *   1. The ancestor tree. Invoked in place, the function resolves the
 *      example's `package.json` (`"type": "module"`) and the workspace's
 *      `node_modules`. A platform uploads only the deploy unit.
 *      `invokeIsolated` copies the unit to a fresh temp dir first.
 *   2. The runtime. Cloudflare runs workerd, not Node — it has already
 *      produced two crashes Node could not (`import.meta.url` undefined, no
 *      filesystem). `assertRunsUnderWorkerd` serves the staged output with
 *      `wrangler pages dev` (workerd) using the scaffold's own
 *      `wrangler.toml`, and asserts a real render plus a real 404.
 *   3. The platform's config contract. `validateVercelOutput` and
 *      `validateNetlifyOutput` check the emitted config against the
 *      documented Build Output API v3 / netlify.toml + Functions shapes,
 *      including that every routed function exists and that the declared
 *      runtime is not past end of life (`scripts/runtime-eol.json`).
 */
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The same render assertions `_invoke-ssr-function.mjs` applies. */
export function renderProblems(status: number, html: string): string[] {
  const checks: Record<string, boolean> = {
    status200: status === 200,
    routerView: html.includes('data-pyreon-router-view'),
    loaderData: html.includes('__PYREON_LOADER_DATA__'),
    noUnfilledShell: !html.includes('<!--pyreon-app-->'),
    hashedClientEntry: /\/assets\/index-[\w.-]+\.js/.test(html),
    noDevEntry: !html.includes('/src/entry-client.ts'),
  }
  return Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([k]) => k)
}

/**
 * Copies `unitDir` (what the platform uploads) OUTSIDE the repo and invokes
 * `funcRel` inside the copy, so neither an ancestor `package.json` nor the
 * workspace `node_modules` can make a broken deploy unit look runnable.
 */
export function invokeIsolated(unitDir: string, funcRel: string, style: string): void {
  const iso = mkdtempSync(join(tmpdir(), 'pyreon-deploy-unit-'))
  try {
    cpSync(unitDir, join(iso, 'unit'), { recursive: true })
    const invoker = join(REPO_ROOT, 'scripts', '_invoke-ssr-function.mjs')
    const r = spawnSync('node', [invoker, join(iso, 'unit', funcRel), style], { encoding: 'utf-8' })
    if (r.status !== 0) {
      throw new Error(
        `${style}: the deploy unit failed to server-render when run OUTSIDE the repo ` +
          `(isolated copy of ${unitDir}):\n${r.stderr || r.stdout || '(no output)'}`,
      )
    }
  } finally {
    rmSync(iso, { recursive: true, force: true })
  }
}

// ─── Vercel Build Output API v3 ────────────────────────────────────────────

export interface RuntimeEol {
  /** Runtime id (e.g. `nodejs22.x`) → end-of-life date (ISO). */
  runtimes: Record<string, string>
}

export function loadRuntimeEol(): RuntimeEol {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'scripts', 'runtime-eol.json'), 'utf-8')) as RuntimeEol
}

/** Problems with a runtime id: unknown to the table, or past end of life on `today`. */
export function runtimeProblems(runtime: string, eol: RuntimeEol, today: Date): string[] {
  const date = eol.runtimes[runtime]
  if (date === undefined) return [`runtime "${runtime}" is not in scripts/runtime-eol.json`]
  if (new Date(date).getTime() <= today.getTime()) {
    return [`runtime "${runtime}" reached end of life on ${date}`]
  }
  return []
}

const ROUTE_KEYS = new Set([
  'src',
  'dest',
  'headers',
  'methods',
  'continue',
  'caseSensitive',
  'check',
  'status',
  'has',
  'missing',
  'locale',
  'middlewarePath',
  'middlewareRawSrc',
  'override',
])
const HANDLE_VALUES = new Set(['filesystem', 'miss', 'rewrite', 'hit', 'error', 'resource'])

/** Validate `<root>/.vercel/output` against the Build Output API v3 contract. */
export function vercelOutputProblems(outputDir: string, eol: RuntimeEol, today = new Date()): string[] {
  const problems: string[] = []
  const configPath = join(outputDir, 'config.json')
  if (!existsSync(configPath)) return [`${configPath} is missing`]
  let config: { version?: unknown; routes?: unknown }
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch (e) {
    return [`config.json is not JSON: ${String(e)}`]
  }
  if (config.version !== 3) problems.push(`config.json: version must be 3, got ${JSON.stringify(config.version)}`)
  if (config.routes !== undefined && !Array.isArray(config.routes)) problems.push('config.json: routes must be an array')
  const dests = new Set<string>()
  for (const [i, route] of ((config.routes as unknown[]) ?? []).entries()) {
    if (typeof route !== 'object' || route === null) {
      problems.push(`routes[${i}] is not an object`)
      continue
    }
    const r = route as Record<string, unknown>
    if ('handle' in r) {
      if (!HANDLE_VALUES.has(String(r.handle))) problems.push(`routes[${i}].handle "${String(r.handle)}" is not a known phase`)
      continue
    }
    if (typeof r.src !== 'string') problems.push(`routes[${i}].src must be a string`)
    else {
      try {
        new RegExp(r.src)
      } catch {
        problems.push(`routes[${i}].src is not a valid regex: ${r.src}`)
      }
    }
    for (const k of Object.keys(r)) if (!ROUTE_KEYS.has(k)) problems.push(`routes[${i}] has unknown key "${k}"`)
    if (r.dest !== undefined && typeof r.dest !== 'string') problems.push(`routes[${i}].dest must be a string`)
    if (typeof r.dest === 'string' && !r.dest.includes('$')) dests.add(r.dest)
    if (r.headers !== undefined) {
      const h = r.headers
      if (typeof h !== 'object' || h === null || Object.values(h).some((v) => typeof v !== 'string')) {
        problems.push(`routes[${i}].headers must map to strings`)
      }
    }
  }
  // Every static dest must resolve to a function or a static file.
  for (const d of dests) {
    const fn = join(outputDir, 'functions', `${d.replace(/^\//, '')}.func`)
    const stat = join(outputDir, 'static', d.replace(/^\//, ''))
    if (!existsSync(fn) && !existsSync(stat)) problems.push(`route dest "${d}" has no function (${fn}) or static file`)
    if (existsSync(fn)) problems.push(...vercelFunctionProblems(fn, eol, today))
  }
  return problems
}

function vercelFunctionProblems(funcDir: string, eol: RuntimeEol, today: Date): string[] {
  const p = join(funcDir, '.vc-config.json')
  if (!existsSync(p)) return [`${funcDir}: .vc-config.json is missing`]
  const cfg = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>
  const problems: string[] = []
  if (typeof cfg.runtime !== 'string') problems.push(`${p}: runtime must be a string`)
  else problems.push(...runtimeProblems(cfg.runtime, eol, today).map((m) => `${p}: ${m}`))
  if (typeof cfg.handler !== 'string') problems.push(`${p}: handler must be a string`)
  else if (!existsSync(join(funcDir, cfg.handler))) problems.push(`${p}: handler "${cfg.handler}" does not exist`)
  if (typeof cfg.runtime === 'string' && cfg.runtime.startsWith('nodejs') && cfg.launcherType !== 'Nodejs') {
    problems.push(`${p}: a Node.js runtime needs launcherType "Nodejs"`)
  }
  return problems
}

// ─── Netlify ────────────────────────────────────────────────────────────────

interface NetlifyToml {
  build?: { publish?: string; functions?: string }
  redirects?: { from?: unknown; to?: unknown; status?: unknown }[]
  headers?: { for?: unknown; values?: Record<string, unknown> }[]
}

/** Validate a staged netlify output directory (the dir holding `netlify.toml`). */
export function netlifyOutputProblems(dir: string): string[] {
  const tomlPath = join(dir, 'netlify.toml')
  if (!existsSync(tomlPath)) return [`${tomlPath} is missing`]
  let toml: NetlifyToml
  try {
    toml = Bun.TOML.parse(readFileSync(tomlPath, 'utf-8')) as NetlifyToml
  } catch (e) {
    return [`netlify.toml does not parse: ${String(e)}`]
  }
  const problems: string[] = []
  const publish = toml.build?.publish
  if (typeof publish !== 'string') problems.push('netlify.toml: [build].publish is required')
  else if (!existsSync(join(dir, publish))) problems.push(`netlify.toml: publish dir "${publish}" does not exist`)
  const functions = toml.build?.functions
  for (const [i, r] of (toml.redirects ?? []).entries()) {
    if (typeof r.from !== 'string' || typeof r.to !== 'string') problems.push(`redirects[${i}] needs string from/to`)
    if (r.status !== undefined && typeof r.status !== 'number') problems.push(`redirects[${i}].status must be a number`)
    const m = typeof r.to === 'string' ? /^\/\.netlify\/functions\/([\w-]+)/.exec(r.to) : null
    if (m) {
      if (typeof functions !== 'string') {
        problems.push(`redirects[${i}] targets a function but [build].functions is not set`)
        continue
      }
      const base = join(dir, functions, m[1] as string)
      const file = ['.mjs', '.js', '.mts', '.ts'].map((e) => base + e).find(existsSync)
      if (!file) problems.push(`redirects[${i}] targets function "${m[1]}" which does not exist in ${functions}`)
      else {
        const src = readFileSync(file, 'utf-8')
        if (!/export\s+default\b/.test(src)) problems.push(`${file}: a Netlify Function needs a default export`)
        if (/export\s+const\s+config\b/.test(src) && !/\bpath\s*:\s*["'`]\//.test(src)) {
          problems.push(`${file}: config.path must be a string starting with "/"`)
        }
      }
    }
  }
  for (const [i, h] of (toml.headers ?? []).entries()) {
    if (typeof h.for !== 'string') problems.push(`headers[${i}].for must be a string`)
    if (h.values && Object.values(h.values).some((v) => typeof v !== 'string')) {
      problems.push(`headers[${i}].values must map to strings`)
    }
  }
  return problems
}

// ─── Cloudflare under workerd ──────────────────────────────────────────────

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer()
    s.once('error', rej)
    s.listen(0, '127.0.0.1', () => {
      const a = s.address()
      s.close(() => (typeof a === 'object' && a ? res(a.port) : rej(new Error('no port'))))
    })
  })
}

/** Path to a wrangler binary, or `null`. `PYREON_WRANGLER` wins. */
export function findWrangler(): string | null {
  const env = process.env['PYREON_WRANGLER']
  if (env) return existsSync(env) ? env : null
  const local = join(REPO_ROOT, 'node_modules', '.bin', 'wrangler')
  return existsSync(local) ? local : null
}

/**
 * Serves a Cloudflare Pages build (the staged `dist`) under workerd with
 * `wrangler pages dev`, configured by the scaffold's own `wrangler.toml`,
 * from a copy OUTSIDE the repo. Asserts `/posts` renders and an unknown path
 * is a real 404.
 *
 * No wrangler → SKIPPED with a loud warning, unless
 * `PYREON_REQUIRE_WORKERD=1` (CI), which turns the skip into a failure.
 */
export async function assertRunsUnderWorkerd(distDir: string): Promise<void> {
  const wrangler = findWrangler()
  if (!wrangler) {
    if (process.env['PYREON_REQUIRE_WORKERD'] === '1') {
      throw new Error('[workerd] PYREON_REQUIRE_WORKERD=1 but no wrangler (set PYREON_WRANGLER to its binary)')
    }
    console.warn(
      '[workerd] SKIPPED: wrangler not found — the Cloudflare output was NOT run under workerd. ' +
        'Set PYREON_WRANGLER=/path/to/wrangler to run it (CI does).',
    )
    return
  }
  const proj = mkdtempSync(join(tmpdir(), 'pyreon-workerd-'))
  const template = join(
    REPO_ROOT,
    'packages/zero/create-zero/templates/_shared/_adapters/cloudflare/wrangler.toml',
  )
  writeFileSync(join(proj, 'wrangler.toml'), readFileSync(template, 'utf-8').replace('{{slug}}', 'pyreon-verify'))
  cpSync(distDir, join(proj, 'dist'), { recursive: true })
  const port = await freePort()
  const child = spawn(wrangler, ['pages', 'dev', '--port', String(port), '--ip', '127.0.0.1'], {
    cwd: proj,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout?.on('data', (d) => (log += String(d)))
  child.stderr?.on('data', (d) => (log += String(d)))
  const base = `http://127.0.0.1:${port}`
  try {
    const deadline = Date.now() + 90_000
    let res: Response | null = null
    while (Date.now() < deadline) {
      if (child.exitCode !== null) break
      try {
        res = await fetch(`${base}/posts`)
        break
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    if (!res) throw new Error(`[workerd] wrangler pages dev never became ready.\n${log.slice(-2000)}`)
    const failed = renderProblems(res.status, await res.text())
    if (failed.length > 0) {
      throw new Error(`[workerd] /posts did not server-render under workerd: ${failed.join(', ')}\n${log.slice(-2000)}`)
    }
    const nf = await fetch(`${base}/definitely-not-a-route-9f2`)
    if (nf.status !== 404) throw new Error(`[workerd] unknown path returned ${nf.status}, expected 404`)
  } finally {
    child.kill('SIGTERM')
    await new Promise((r) => setTimeout(r, 300))
    if (child.exitCode === null) child.kill('SIGKILL')
    rmSync(proj, { recursive: true, force: true })
  }
}

// ─── The node adapter's own server ─────────────────────────────────────────

/**
 * Boots the node adapter's emitted `dist/index.js` on a free port (`PORT` is
 * honoured at runtime) and runs `fn` against it. Collects the server's stderr
 * so a check can assert what production LOGS.
 */
export async function withNodeServer(
  distDir: string,
  fn: (origin: string, stderr: () => string) => Promise<void>,
): Promise<void> {
  const entry = join(distDir, 'index.js')
  if (!existsSync(entry)) throw new Error(`[node-server] ${entry} does not exist`)
  const port = await freePort()
  const child = spawn('node', [entry], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let err = ''
  child.stderr?.on('data', (d) => (err += String(d)))
  const origin = `http://127.0.0.1:${port}`
  try {
    const deadline = Date.now() + 30_000
    for (;;) {
      if (child.exitCode !== null) throw new Error(`[node-server] exited early:\n${err}`)
      try {
        await fetch(origin)
        break
      } catch {
        if (Date.now() > deadline) throw new Error(`[node-server] never became ready:\n${err}`)
        await new Promise((r) => setTimeout(r, 200))
      }
    }
    await fn(origin, () => err)
  } finally {
    child.kill('SIGTERM')
  }
}
