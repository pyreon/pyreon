#!/usr/bin/env bun
/**
 * Install and build the catalogue-app arms:
 * `bun setup.ts [armId…] [--pyreon=npm|workspace] [--copy-shared] [--reinstall]`.
 *
 * Every arm has its own package.json with exact versions and its own
 * package-lock.json, and is installed with `npm ci` in its own directory
 * (outside the root bun workspace, so a normal `bun install` never downloads
 * any of it). The build runs with NODE_ENV=production.
 *
 * The pyreon arm has two sources for its `@pyreon/*` packages:
 *
 *   --pyreon=npm        (default) `npm ci` from `arms/pyreon/package-lock.json`:
 *                       the published packages, what an app installs.
 *   --pyreon=workspace  no install of its own; Node and Vite resolve `@pyreon/*`
 *                       upward to the workspace's built `lib/` (`bun install` at
 *                       the repo root builds it, `bun scripts/bootstrap.ts`
 *                       rebuilds it). For measuring a source change.
 *
 * Each run records which one it measured (`run.json` → `pyreonSource`).
 *
 * --copy-shared  re-copy shared/data.ts and shared/app.css into every arm
 * --reinstall    run the install even when node_modules is current
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { type Arm, APP_ROOT, assertSharedIdentical, loadArms, SHARED } from './harness/arms'

export type PyreonSource = 'npm' | 'workspace'

const args = process.argv.slice(2)
const ids = args.filter((a) => !a.startsWith('--'))
const copyShared = args.includes('--copy-shared')
const reinstall = args.includes('--reinstall')
const pyreonArg = args.find((a) => a.startsWith('--pyreon='))?.slice('--pyreon='.length) ?? 'npm'
if (pyreonArg !== 'npm' && pyreonArg !== 'workspace') {
  throw new Error(`[real-bench/app] --pyreon=${pyreonArg}: expected "npm" or "workspace"`)
}
const pyreon: PyreonSource = pyreonArg
const REPO_ROOT = resolve(APP_ROOT, '..', '..', '..')

function sh(cwd: string, argv: string[]): void {
  const [cmd, ...rest] = argv
  const r = spawnSync(cmd as string, rest, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  })
  if (r.status !== 0) throw new Error(`[real-bench/app] ${argv.join(' ')} failed in ${cwd}`)
}

/** True when node_modules is missing or older than the lockfile it was installed from. */
function installIsStale(dir: string): boolean {
  const marker = join(dir, 'node_modules', '.package-lock.json')
  if (!existsSync(marker)) return true
  return statSync(join(dir, 'package-lock.json')).mtimeMs > statSync(marker).mtimeMs
}

function setUp(arm: Arm): void {
  const { dir, m } = arm
  if (copyShared) {
    copyFileSync(join(SHARED, 'data.ts'), join(dir, m.dataFile))
    copyFileSync(join(SHARED, 'app.css'), join(dir, m.cssFile))
  }
  assertSharedIdentical(arm)
  rmSync(join(dir, m.outDir), { recursive: true, force: true })
  if (m.id === 'pyreon' && pyreon === 'workspace') {
    // An install in the arm would shadow the workspace packages.
    rmSync(join(dir, 'node_modules'), { recursive: true, force: true })
    const vite = join(REPO_ROOT, 'node_modules', '.bin', 'vite')
    if (!existsSync(vite)) {
      throw new Error(
        '[real-bench/app] --pyreon=workspace needs `bun install` at the repo root first',
      )
    }
    sh(dir, [vite, 'build'])
    return
  }
  if (reinstall || installIsStale(dir)) {
    // devDependencies are the build tools: install them even though NODE_ENV=production.
    sh(dir, ['npm', 'ci', '--no-audit', '--no-fund', '--include=dev'])
  }
  sh(dir, m.build)
}

for (const arm of loadArms(ids)) {
  console.log(`▸ ${arm.m.id}${arm.m.id === 'pyreon' ? ` (@pyreon/* from ${pyreon})` : ''}`)
  setUp(arm)
}
