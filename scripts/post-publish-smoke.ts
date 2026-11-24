#!/usr/bin/env bun
/**
 * post-publish-smoke — install the PUBLISHED packages from npm in a clean
 * directory and prove the scaffolds a user gets actually work.
 *
 * Every other scaffold gate (`scaffold-smoke.ts`, `scaffold-native-smoke.ts`)
 * runs the scaffolder from source and resolves `@pyreon/*` to workspace
 * source. Neither can see what only exists after a publish: a tarball missing
 * a file (`files` / `.npmignore`), a `lib/` that differs from `src/`, a
 * dependency declared nowhere but hoisted in the monorepo, a scaffolder that
 * stamps the wrong version, a dist-tag that never moved. This script tests
 * npm, not the repository.
 *
 * For the given dist-tag (default `latest`):
 *
 *   resolve      read the dist-tag from the registry; with `--expect-version`,
 *                fail unless the tag points at that version
 *   scaffold     `npm exec @pyreon/<create-x>@<version>` in a fresh temp dir
 *                outside the repository (no ancestor package.json or
 *                node_modules, so nothing can resolve through a workspace)
 *   specs        every `@pyreon/*` dep the scaffold wrote is `^<version>`, and
 *                no dep is `workspace:` / `link:` / `file:` / git
 *   install      `npm install` against registry.npmjs.org only, with an empty
 *                user config and an npm cache private to this run
 *   lockfile     every package-lock entry was resolved from the registry
 *                (no `link`, no local or git source), and every installed
 *                `@pyreon/*` (lockfile AND node_modules on disk) is <version>
 *   typecheck    `tsc --noEmit`
 *   build        the scaffold's `build` script
 *   smoke        start what was built and assert SPECIFIC rendered text. A
 *                page that only proves "the server answered" or "the root has
 *                children" passes on an empty shell; each cell names text that
 *                exists only when the route really rendered
 *   hydrate      in real Chromium, click and assert the DOM changed (a page
 *                that server-renders but never hydrates ignores the click)
 *
 * Cells: `zero-node-ssr` (create-zero app + node adapter: SSR server, API
 * route, hydration), `zero-static-ssg` (create-zero app + static/ssg:
 * prerendered HTML through `zero preview`), `multiplatform-web`
 * (create-multiplatform's web target: vite build + preview, client render).
 *
 * Fails CLOSED: a registry error, a missing tag, a missing browser, a step
 * that times out — every one is a failure naming the cell and the step, never
 * a skip.
 *
 * Usage:
 *   bun scripts/post-publish-smoke.ts                     # dist-tag latest
 *   bun scripts/post-publish-smoke.ts --tag rc
 *   bun scripts/post-publish-smoke.ts --expect-version 0.55.0
 *   bun scripts/post-publish-smoke.ts --only zero-node-ssr --keep
 */

import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isEntry } from './is-entry'
import { removeOnExit } from './remove-on-exit'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const REGISTRY = 'https://registry.npmjs.org/'

// ─── Pure parts (unit-tested in test-utils/src/tests/post-publish-smoke.test.ts) ───

export interface Args {
  tag: string
  expectVersion: string | undefined
  only: string[]
  keep: boolean
}

export function parseArgs(argv: readonly string[]): Args {
  const out: Args = { tag: 'latest', expectVersion: undefined, only: [], keep: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    const eq = a.indexOf('=')
    const key = eq >= 0 ? a.slice(0, eq) : a
    const value = (): string => {
      const v = eq >= 0 ? a.slice(eq + 1) : argv[++i]
      if (v === undefined || v === '' || v.startsWith('--')) throw new Error(`${key} needs a value`)
      return v
    }
    if (key === '--tag') out.tag = value()
    else if (key === '--expect-version') out.expectVersion = value()
    else if (key === '--only') out.only.push(...value().split(',').filter(Boolean))
    else if (key === '--keep') out.keep = true
    else throw new Error(`unknown argument "${a}"`)
  }
  // A dist-tag is embedded in a registry URL and an npm spec: keep it plain.
  if (!/^[a-z][a-z0-9._-]*$/i.test(out.tag)) throw new Error(`invalid dist-tag "${out.tag}"`)
  if (
    out.expectVersion !== undefined &&
    !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(out.expectVersion)
  ) {
    throw new Error(`invalid --expect-version "${out.expectVersion}"`)
  }
  return out
}

/** The version a dist-tag points at, from a packument's `dist-tags`. Throws with the reason. */
export function resolveDistTag(
  packument: { 'dist-tags'?: Record<string, string> },
  pkg: string,
  tag: string,
  expectVersion?: string,
): string {
  const tags = packument['dist-tags'] ?? {}
  const version = tags[tag]
  if (!version) {
    const known =
      Object.entries(tags)
        .map(([t, v]) => `${t}=${v}`)
        .join(', ') || '(none)'
    throw new Error(`${pkg} has no dist-tag "${tag}" on npm. Tags: ${known}`)
  }
  if (expectVersion !== undefined && version !== expectVersion) {
    throw new Error(
      `${pkg}@${tag} is ${version}, expected ${expectVersion} (the dist-tag did not move to the released version)`,
    )
  }
  return version
}

const LOCAL_SPEC = /^(workspace:|link:|file:|portal:|git\+|git:|github:|https?:|\.{0,2}\/)/

/**
 * Problems with the dependency specs a scaffolder wrote: any local or git
 * source, and any `@pyreon/*` spec that is not `^<version>` / `<version>`.
 */
export function checkScaffoldSpecs(
  pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
  version: string,
): string[] {
  const problems: string[] = []
  const all = { ...pkg.dependencies, ...pkg.devDependencies }
  let pyreonDeps = 0
  for (const [name, spec] of Object.entries(all)) {
    if (name.startsWith('@pyreon/')) pyreonDeps++
    if (LOCAL_SPEC.test(spec)) problems.push(`${name}: non-registry spec "${spec}"`)
    else if (name.startsWith('@pyreon/') && spec !== `^${version}` && spec !== version) {
      problems.push(`${name}: spec "${spec}", expected "^${version}"`)
    }
  }
  if (pyreonDeps === 0) problems.push('the scaffold declares no @pyreon/* dependency')
  return problems
}

interface LockEntry {
  version?: string
  resolved?: string
  link?: boolean
  inBundle?: boolean
}

export interface PackageLock {
  lockfileVersion?: number
  packages?: Record<string, LockEntry>
}

/**
 * Problems in an npm package-lock (v2/v3) that show anything was installed
 * from somewhere other than the npm registry: a `link` entry (a symlinked
 * workspace or `file:` directory), a `resolved` that is not a registry
 * tarball, a local or git `version`, or the raw text naming a local protocol.
 */
export function checkLockfileSources(
  lock: PackageLock,
  rawText: string,
  registry = REGISTRY,
): string[] {
  const problems: string[] = []
  if (lock.lockfileVersion === undefined || lock.lockfileVersion < 2 || !lock.packages) {
    return [
      `unsupported lockfile (lockfileVersion ${String(lock.lockfileVersion)}, needs v2+ "packages")`,
    ]
  }
  const root = lock.packages['']
  if (root && 'workspaces' in root) problems.push('the root package declares workspaces')
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === '') continue
    if (entry.link) {
      problems.push(`${key}: linked (not installed from the registry)`)
      continue
    }
    if (entry.version && LOCAL_SPEC.test(entry.version)) {
      problems.push(`${key}: version "${entry.version}"`)
    }
    if (entry.resolved === undefined) {
      if (!entry.inBundle) problems.push(`${key}: no "resolved" URL`)
    } else if (!entry.resolved.startsWith(registry)) {
      problems.push(`${key}: resolved from "${entry.resolved}"`)
    }
  }
  for (const proto of ['workspace:', 'link:', 'file:']) {
    if (rawText.includes(`"${proto}`)) problems.push(`the lockfile text contains "${proto}"`)
  }
  return problems
}

/** `node_modules/@pyreon/x` (top level or nested) → `@pyreon/x`; anything else → null. */
export function pyreonNameOf(lockKey: string): string | null {
  const m = /(?:^|\/)node_modules\/(@pyreon\/[^/]+)$/.exec(lockKey)
  return m ? m[1]! : null
}

/**
 * Every `@pyreon/*` package in the lockfile must be `version` (one fixed
 * release group), and every declared `@pyreon/*` dependency must be in it.
 */
export function checkLockfilePyreonVersions(
  lock: PackageLock,
  declared: readonly string[],
  version: string,
): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    const name = pyreonNameOf(key)
    if (!name) continue
    seen.add(name)
    if (entry.version !== version) {
      problems.push(`${key}: ${entry.version ?? '(no version)'}, expected ${version}`)
    }
  }
  for (const name of declared) {
    if (!seen.has(name)) problems.push(`${name}: declared but not in the lockfile`)
  }
  return problems
}

/** Needles missing from an HTML page (each is a string that only a real render contains). */
export function missingText(html: string, needles: readonly string[]): string[] {
  return needles.filter((n) => !html.includes(n))
}

// ─── Cells ──────────────────────────────────────────────────────────────────

interface Cell {
  name: string
  scaffolder: '@pyreon/create-zero' | '@pyreon/create-multiplatform'
  args: string[]
  /** The typecheck command (inside the project). */
  typecheck: string[]
  smoke: (dir: string, run: Runner) => Promise<void>
}

const SSR_HOME_TEXT = ['Stay fast.', 'Signal-Based Reactivity', 'File-Based Routing']

const CELLS: Cell[] = [
  {
    name: 'zero-node-ssr',
    scaffolder: '@pyreon/create-zero',
    args: ['--template', 'app', '--adapter', 'node', '--yes'],
    typecheck: ['npm', 'run', 'typecheck'],
    smoke: async (dir, run) => {
      await withProcess(
        dir,
        () => ['node', join(dir, 'dist', 'index.js')],
        async (origin) => {
          await run.step('smoke: GET / server-renders the home route', async () => {
            const html = await fetchHtml(`${origin}/`)
            const missing = missingText(html, SSR_HOME_TEXT)
            if (missing.length > 0) {
              throw new Error(
                `/ did not server-render the home route; missing ${JSON.stringify(missing)}. Body:\n${html.slice(0, 600)}`,
              )
            }
          })
          await run.step('smoke: GET /api/health answers JSON', async () => {
            const res = await fetch(`${origin}/api/health`)
            const type = res.headers.get('content-type') ?? ''
            if (res.status !== 200 || !type.includes('application/json')) {
              throw new Error(`/api/health: expected 200 JSON, got ${res.status} "${type}"`)
            }
            await res.json()
          })
          await run.step('hydrate: /counter increments in Chromium', () =>
            clickIncrements(`${origin}/counter`, {
              ready: '[data-pyreon-hydrated]',
              display: '.counter-display',
              button: { role: 'button', name: '+' },
            }),
          )
        },
      )
    },
  },
  {
    name: 'zero-static-ssg',
    scaffolder: '@pyreon/create-zero',
    args: ['--template', 'app', '--adapter', 'static', '--mode', 'ssg', '--yes'],
    typecheck: ['npm', 'run', 'typecheck'],
    smoke: async (dir, run) => {
      const zero = join(dir, 'node_modules', '.bin', 'zero')
      await withProcess(
        dir,
        (port) => [zero, 'preview', '--port', port, '--host', '127.0.0.1'],
        async (origin) => {
          await run.step('smoke: zero preview serves the prerendered home route', async () => {
            const html = await fetchHtml(`${origin}/`)
            const missing = missingText(html, SSR_HOME_TEXT)
            if (missing.length > 0) {
              throw new Error(
                `/ is not the prerendered home route; missing ${JSON.stringify(missing)}. Body:\n${html.slice(0, 600)}`,
              )
            }
          })
        },
      )
    },
  },
  {
    name: 'multiplatform-web',
    scaffolder: '@pyreon/create-multiplatform',
    args: [],
    // The template has no typecheck script; its tsconfig is the contract.
    typecheck: ['npm', 'exec', '--no', '--', 'tsc', '--noEmit', '-p', 'tsconfig.json'],
    smoke: async (dir, run) => {
      const vite = join(dir, 'node_modules', '.bin', 'vite')
      const argv = (port: string) => [
        vite,
        'preview',
        '--port',
        port,
        '--strictPort',
        '--host',
        '127.0.0.1',
      ]
      await withProcess(dir, argv, async (origin) => {
        await run.step('smoke: vite preview serves the web shell', async () => {
          const html = await fetchHtml(`${origin}/`)
          if (!html.includes('id="app"') || !/<script[^>]+src="\/assets\/[^"]+\.js"/.test(html)) {
            throw new Error(
              `/ is not the built web shell (no #app or no built script). Body:\n${html.slice(0, 600)}`,
            )
          }
        })
        // A client-rendered app: the shell is empty by design, so the content
        // assertion has to run in a browser.
        await run.step('hydrate: the App renders and Increment works in Chromium', () =>
          clickIncrements(`${origin}/`, {
            ready: '[data-testid="count"]',
            display: '[data-testid="count"]',
            button: { role: 'button', name: 'Increment' },
          }),
        )
      })
    },
  },
]

// ─── Runner ─────────────────────────────────────────────────────────────────

const inActions = process.env.GITHUB_ACTIONS === 'true'

class StepError extends Error {
  constructor(
    readonly cell: string,
    readonly step: string,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause))
  }
}

class Runner {
  readonly results: { cell: string; step: string; ok: boolean; ms: number }[] = []

  constructor(readonly cell: string) {}

  async step<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    const start = Date.now()
    console.log(`\n▶ [${this.cell}] ${name}`)
    try {
      const value = await fn()
      const ms = Date.now() - start
      this.results.push({ cell: this.cell, step: name, ok: true, ms })
      console.log(`✓ [${this.cell}] ${name} (${(ms / 1000).toFixed(1)}s)`)
      return value
    } catch (err) {
      const ms = Date.now() - start
      this.results.push({ cell: this.cell, step: name, ok: false, ms })
      throw err instanceof StepError ? err : new StepError(this.cell, name, err)
    }
  }
}

/** The child environment: no inherited npm/bun config, registry and cache pinned. */
function cleanEnv(npmCache: string, userConfig: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(npm_|NPM_|BUN_|NODE_PATH$|NODE_ENV$|NODE_OPTIONS$|PYREON_)/.test(k)) continue
    env[k] = v
  }
  env.npm_config_registry = REGISTRY
  env.npm_config_cache = npmCache
  env.npm_config_userconfig = userConfig
  env.npm_config_audit = 'false'
  env.npm_config_fund = 'false'
  env.npm_config_update_notifier = 'false'
  env.npm_config_yes = 'true'
  return env
}

let childEnv: NodeJS.ProcessEnv = {}

function exec(cmd: string[], cwd: string, timeoutMs: number): void {
  console.log(`  $ ${cmd.join(' ')}`)
  const r = spawnSync(cmd[0]!, cmd.slice(1), {
    cwd,
    env: childEnv,
    stdio: 'inherit',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  })
  if (r.error) throw new Error(`${cmd.join(' ')}: ${r.error.message}`)
  if (r.signal) {
    throw new Error(`${cmd.join(' ')}: killed by ${r.signal} (timeout ${timeoutMs / 1000}s)`)
  }
  if (r.status !== 0) throw new Error(`${cmd.join(' ')} exited with code ${r.status}`)
}

/** Fails unless `dir` is outside the repository with no package.json / node_modules above it. */
function assertIsolated(dir: string): void {
  const real = realpathSync(dir)
  const repo = realpathSync(REPO_ROOT)
  if (real === repo || real.startsWith(repo + sep) || !relative(real, repo).startsWith('..')) {
    throw new Error(`${real} is inside or above the repository ${repo}`)
  }
  for (let d = dirname(real); ; d = dirname(d)) {
    for (const marker of ['package.json', 'node_modules', 'bun.lock', 'pnpm-workspace.yaml']) {
      if (existsSync(join(d, marker))) {
        throw new Error(
          `${join(d, marker)} exists above the project: resolution could leak into it`,
        )
      }
    }
    if (dirname(d) === d) break
  }
}

async function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer()
    s.once('error', rej)
    s.listen(0, '127.0.0.1', () => {
      const a = s.address()
      s.close(() => (typeof a === 'object' && a ? res(a.port) : rej(new Error('no free port'))))
    })
  })
}

/** Signals a process group; a group that already exited is not an error. */
function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e
  }
}

/**
 * Starts a long-running server on a free port (given to `cmd` and as PORT) in
 * its own process group, waits until it answers on 127.0.0.1, runs
 * `fn(origin)`, then kills the whole group.
 */
async function withProcess(
  cwd: string,
  cmd: (port: string) => string[],
  fn: (origin: string) => Promise<void>,
): Promise<void> {
  const port = await freePort()
  const argv = cmd(String(port))
  console.log(`  $ ${argv.join(' ')}`)
  const child: ChildProcess = spawn(argv[0]!, argv.slice(1), {
    cwd,
    env: { ...childEnv, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let log = ''
  child.stdout?.on('data', (d: Buffer) => (log += d.toString()))
  child.stderr?.on('data', (d: Buffer) => (log += d.toString()))
  const origin = `http://127.0.0.1:${port}`
  try {
    const deadline = Date.now() + 45_000
    for (;;) {
      if (child.exitCode !== null) {
        throw new Error(`server exited early (code ${child.exitCode}):\n${log.slice(-2000)}`)
      }
      try {
        await fetch(origin, { signal: AbortSignal.timeout(2000) })
        break
      } catch {
        if (Date.now() > deadline) {
          throw new Error(`server never answered on ${origin}:\n${log.slice(-2000)}`)
        }
        await new Promise((r) => setTimeout(r, 250))
      }
    }
    await fn(origin)
  } finally {
    if (child.pid !== undefined) {
      killGroup(child.pid, 'SIGTERM')
      await new Promise((r) => setTimeout(r, 300))
      killGroup(child.pid, 'SIGKILL')
    }
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  const type = res.headers.get('content-type') ?? ''
  if (res.status !== 200) throw new Error(`GET ${url}: HTTP ${res.status}`)
  if (!type.includes('text/html')) throw new Error(`GET ${url}: content-type "${type}"`)
  return res.text()
}

/**
 * Loads `url` in Chromium, reads the counter, clicks the button and requires
 * the text to go 0 → 1, with no page error. Fails closed: no launchable
 * Chromium is a failure naming the install command.
 */
async function clickIncrements(
  url: string,
  sel: { ready: string; display: string; button: { role: 'button'; name: string } },
): Promise<void> {
  const { chromium } = await import('playwright')
  let browser: Awaited<ReturnType<typeof chromium.launch>>
  try {
    browser = await chromium.launch()
  } catch (e) {
    throw new Error(
      `could not launch Chromium — run \`bunx playwright install chromium\`.\n${String(e)}`,
    )
  }
  try {
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(url)
    await page.waitForSelector(sel.ready, { timeout: 15_000 })
    const display = page.locator(sel.display)
    const before = (await display.textContent())?.trim()
    await page.getByRole(sel.button.role, { name: sel.button.name, exact: true }).click()
    await page
      .waitForFunction(
        ([s, prev]) => document.querySelector(s!)?.textContent?.trim() !== prev,
        [sel.display, before] as const,
        { timeout: 5_000 },
      )
      .catch(() => undefined)
    const after = (await display.textContent())?.trim()
    if (before !== '0' || after !== '1') {
      throw new Error(`expected "0" → "1" after the click, got "${before}" → "${after}"`)
    }
    if (errors.length > 0) throw new Error(`page errors:\n${errors.join('\n')}`)
  } finally {
    await browser.close()
  }
}

async function fetchPackument(pkg: string): Promise<{ 'dist-tags'?: Record<string, string> }> {
  const url = `${REGISTRY}${pkg.replace('/', '%2f')}`
  const res = await fetch(url, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 404) throw new Error(`${pkg} is not on npm (404)`)
  if (!res.ok) throw new Error(`registry HTTP ${res.status} for ${pkg}`)
  return (await res.json()) as { 'dist-tags'?: Record<string, string> }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

async function runCell(cell: Cell, version: string, root: string): Promise<Runner> {
  const run = new Runner(cell.name)
  const work = join(root, cell.name)
  const name = `pp-${cell.name}`
  const dir = join(work, name)
  await run.step('scaffold', () => {
    mkdirSync(work, { recursive: true })
    assertIsolated(work)
    exec(
      [
        'npm',
        'exec',
        '--yes',
        `--package=${cell.scaffolder}@${version}`,
        '--',
        cell.scaffolder.split('/')[1]!,
        name,
        ...cell.args,
      ],
      work,
      180_000,
    )
    if (!existsSync(join(dir, 'package.json'))) {
      throw new Error(`the scaffolder wrote no ${name}/package.json`)
    }
  })
  const pkg = readJson<{
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }>(join(dir, 'package.json'))
  const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((n) =>
    n.startsWith('@pyreon/'),
  )
  await run.step('specs: every @pyreon/* dep is ^version, nothing local', () => {
    const problems = checkScaffoldSpecs(pkg, version)
    if (problems.length > 0) throw new Error(problems.join('\n'))
    console.log(`  ${declared.length} @pyreon/* deps, all ^${version}`)
  })
  await run.step('install (npm, registry only)', () =>
    exec(['npm', 'install', '--no-audit', '--no-fund'], dir, 600_000),
  )
  await run.step('lockfile: registry-only sources, @pyreon/* = version', () => {
    const lockPath = join(dir, 'package-lock.json')
    if (!existsSync(lockPath)) throw new Error('npm install wrote no package-lock.json')
    const raw = readFileSync(lockPath, 'utf8')
    const lock = JSON.parse(raw) as PackageLock
    const problems = [
      ...checkLockfileSources(lock, raw),
      ...checkLockfilePyreonVersions(lock, declared, version),
    ]
    // The lockfile is a record; node_modules is what runs. Read it too.
    const scope = join(dir, 'node_modules', '@pyreon')
    const onDisk = existsSync(scope) ? readdirSync(scope) : []
    for (const n of declared) {
      if (!onDisk.includes(n.slice('@pyreon/'.length))) problems.push(`${n}: not in node_modules`)
    }
    for (const n of onDisk) {
      const v = readJson<{ version?: string }>(join(scope, n, 'package.json')).version
      if (v !== version) problems.push(`node_modules/@pyreon/${n}: ${v}, expected ${version}`)
    }
    if (problems.length > 0) throw new Error(problems.join('\n'))
    const entries = Object.keys(lock.packages ?? {}).length - 1
    console.log(
      `  ${entries} lockfile entries from ${REGISTRY}; ${onDisk.length} @pyreon/* installed, all ${version}`,
    )
  })
  await run.step('typecheck', () => exec(cell.typecheck, dir, 300_000))
  await run.step('build', () => exec(['npm', 'run', 'build'], dir, 300_000))
  await cell.smoke(dir, run)
  return run
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  const cells = args.only.length === 0 ? CELLS : CELLS.filter((c) => args.only.includes(c.name))
  if (cells.length === 0) {
    throw new Error(`--only matched no cell. Cells: ${CELLS.map((c) => c.name).join(', ')}`)
  }

  const resolveRun = new Runner('registry')
  const results: Runner['results'] = []
  const failures: StepError[] = []
  let version = ''
  try {
    version = await resolveRun.step(`resolve dist-tag "${args.tag}"`, async () => {
      const versions = new Map<string, string>()
      for (const scaffolder of new Set(cells.map((c) => c.scaffolder))) {
        versions.set(
          scaffolder,
          resolveDistTag(
            await fetchPackument(scaffolder),
            scaffolder,
            args.tag,
            args.expectVersion,
          ),
        )
      }
      const distinct = new Set(versions.values())
      if (distinct.size !== 1) {
        throw new Error(
          `the scaffolders disagree on "${args.tag}": ${[...versions].map(([p, v]) => `${p}@${v}`).join(', ')}`,
        )
      }
      return [...distinct][0]!
    })
    console.log(`  dist-tag "${args.tag}" → ${version}`)
  } catch (e) {
    failures.push(e as StepError)
  }
  results.push(...resolveRun.results)

  if (failures.length === 0) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-post-publish-')))
    const cleanup = args.keep ? () => {} : removeOnExit(root)
    const userConfig = join(root, '.npmrc-empty')
    writeFileSync(userConfig, '')
    childEnv = cleanEnv(join(root, '.npm-cache'), userConfig)
    console.log(`  work dir ${root}${args.keep ? ' (kept)' : ''}`)
    try {
      for (const cell of cells) {
        let runner: Runner | undefined
        try {
          runner = await runCell(cell, version, root)
          results.push(...runner.results)
        } catch (e) {
          const err = e instanceof StepError ? e : new StepError(cell.name, '(unexpected)', e)
          failures.push(err)
          console.error(`✗ [${err.cell}] ${err.step}\n${err.message}`)
        }
      }
    } finally {
      cleanup()
    }
  }

  return report(args, version, cells, failures)
}

function report(args: Args, version: string, cells: Cell[], failures: StepError[]): number {
  const lines = [
    `## Post-publish smoke — dist-tag \`${args.tag}\`${version ? ` → ${version}` : ''}`,
    '',
    '| cell | verdict |',
    '| --- | --- |',
    ...(version
      ? cells.map((c) => {
          const f = failures.find((x) => x.cell === c.name)
          return `| ${c.name} | ${f ? `FAILED at \`${f.step}\`` : 'passed'} |`
        })
      : [`| registry | FAILED at \`${failures[0]?.step ?? 'resolve'}\` |`]),
  ]
  console.log(`\n${lines.join('\n')}`)
  for (const f of failures) {
    console.error(`\n✗ [${f.cell}] FAILED at step "${f.step}":\n${f.message}`)
    if (inActions) {
      const msg = f.message.split('\n').slice(0, 20).join('%0A')
      console.log(`::error title=post-publish smoke: ${f.cell} failed at "${f.step}"::${msg}`)
    }
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`)
  }
  if (failures.length > 0) {
    console.error(`\npost-publish smoke FAILED: ${failures.length} failing cell(s).`)
    return 1
  }
  console.log(
    `\npost-publish smoke passed: ${cells.length} cell(s) against ${args.tag} → ${version}.`,
  )
  return 0
}

if (isEntry(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(
        `post-publish smoke FAILED before any cell ran: ${err instanceof Error ? err.message : String(err)}`,
      )
      process.exit(1)
    },
  )
}
