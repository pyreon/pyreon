/**
 * Server actions across a REAL client + SSR build.
 *
 * `defineAction` used to mint `action_${crypto.randomUUID()}` on every module
 * evaluation, so the client bundle and the server bundle each carried a
 * different id and every client call 404'd at `/_zero/actions/<id>`. Zero's
 * Vite plugin now derives the id from the module path + binding at build time
 * and strips the handler (and the imports only it used) from the client.
 *
 * Builds `fixture-actions` with the zero plugin chain from src and reads the
 * emitted files — the only place both bundles exist side by side.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { actionId } from '../../actions-transform'
import { zeroPlugin } from '../../vite-plugin'

const FIXTURE = resolve(import.meta.dirname, 'fixture-actions')
const DIST = join(FIXTURE, 'dist')

function readTree(dir: string): string {
  let out = ''
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out += readTree(full)
    else if (/\.(m?js|html)$/.test(entry)) out += `\n/* ${full} */\n${readFileSync(full, 'utf-8')}`
  }
  return out
}

const ids = (text: string): string[] => [...new Set(text.match(/action_[0-9a-f-]{24,36}/g) ?? [])]

let client = ''
let server = ''

beforeAll(async () => {
  await rm(DIST, { recursive: true, force: true })
  await build({
    root: FIXTURE,
    configFile: false,
    logLevel: 'error',
    plugins: [
      ...zeroPlugin({ mode: 'ssr' }),
      // The fixture sits inside @pyreon/zero, whose package.json declares
      // `sideEffects: false` — which lets the bundler drop `db.js` on its
      // own and would hide a pruning regression. A real app's modules have
      // side effects by default; model that.
      {
        name: 'fixture-has-side-effects',
        transform(code: string, id: string) {
          return id.includes('fixture-actions') ? { code, moduleSideEffects: true } : null
        },
      },
    ],
    resolve: { conditions: ['bun'] },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      minify: false,
    },
  })
  client = readTree(join(DIST, 'assets'))
  server = readTree(join(DIST, 'server'))
}, 120_000)

afterAll(async () => {
  await rm(DIST, { recursive: true, force: true })
  await rm(join(FIXTURE, '__pyreon-zero-ssr-entry.js'), { force: true })
})

describe('server actions — client and server bundles agree', () => {
  const expected = actionId('src/actions.js', 'createPost')

  it('the client bundle carries the deterministic id', () => {
    expect(ids(client)).toEqual([expected])
  })

  it('the server bundle registers the SAME id', () => {
    expect(ids(server)).toEqual([expected])
  })

  it('the handler body and its server-only import are absent from the client', () => {
    expect(client).not.toContain('HANDLER_BODY_MARKER')
    expect(client).not.toContain('DB_MODULE_MARKER')
    expect(server).toContain('HANDLER_BODY_MARKER')
    expect(server).toContain('DB_MODULE_MARKER')
  })
})

describe('a FRESH built server answers an action with no prior render', () => {
  // defineAction registers when its module evaluates, and route modules load
  // lazily — so before the build-time manifest, a fresh server answered 404
  // "Action not found" until some page render had loaded the module. Run the
  // built entry in its OWN process so nothing has been rendered or imported.
  it('POST /_zero/actions/<id> loads the defining module on demand', () => {
    const id = actionId('src/actions.js', 'createPost')
    const out = join(DIST, 'fresh-result.json')
    const script = join(DIST, 'fresh-probe.mjs')
    writeFileSync(
      script,
      `import { writeFileSync } from 'node:fs'
const { default: handler } = await import(${JSON.stringify(join(DIST, 'server', 'entry-server.js'))})
const res = await handler(new Request('http://localhost/_zero/actions/${id}', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: 1 }),
}))
writeFileSync(${JSON.stringify(out)}, JSON.stringify({ status: res.status, body: await res.text() }))
`,
    )
    const run = spawnSync(process.execPath.includes('bun') ? 'node' : process.execPath, [script], {
      cwd: FIXTURE,
      env: { ...process.env, NODE_ENV: 'production' },
    })
    expect(run.status).toBe(0)
    const result = JSON.parse(readFileSync(out, 'utf-8')) as { status: number; body: string }
    expect(result.status).toBe(200)
    expect(result.body).toContain('HANDLER_BODY_MARKER')
  })
})
