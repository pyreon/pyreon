#!/usr/bin/env bun
/**
 * Install and build the arms:
 * `bun setup.ts [stackId…] [--zero=npm|workspace] [--copy-data] [--reinstall]`.
 *
 * Every arm has its own package.json with exact versions and its own
 * package-lock.json, and is installed with `npm ci` in its own directory
 * (outside the root bun workspace, so a normal `bun install` never downloads
 * any of it).
 *
 * The zero arm has two sources for its `@pyreon/*` packages:
 *
 *   --zero=npm        (default) `npm ci` from `apps/zero/package-lock.json`: the
 *                     published packages, what an app installs. Needs no built
 *                     workspace.
 *   --zero=workspace  no install of its own; Node and Vite resolve `@pyreon/*`
 *                     upward to the workspace's built `lib/` (`bun install` at
 *                     the repo root builds it, `bun scripts/bootstrap.ts`
 *                     rebuilds it). For measuring a source change.
 *
 * Each run records which one it measured (`run.json` → `zeroSource`).
 *
 * --copy-data  re-copy shared/data.ts into every arm (the harness refuses a drifted copy)
 * --reinstall  run the install even when node_modules is current
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { assertNode, nodeVersion, type ZeroSource } from './lib/run'
import { loadStacks, ROOT, type StackManifest } from './lib/stacks'

const args = process.argv.slice(2)
const ids = args.filter((a) => !a.startsWith('--'))
const copyData = args.includes('--copy-data')
const reinstall = args.includes('--reinstall')
const zeroArg = args.find((a) => a.startsWith('--zero='))?.slice('--zero='.length) ?? 'npm'
if (zeroArg !== 'npm' && zeroArg !== 'workspace') {
  throw new Error(`[stacks-bench] --zero=${zeroArg}: expected "npm" or "workspace"`)
}
const zero: ZeroSource = zeroArg

function sh(cwd: string, argv: string[]): void {
  const [cmd, ...rest] = argv
  const r = spawnSync(cmd as string, rest, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      ASTRO_TELEMETRY_DISABLED: '1',
      NUXT_TELEMETRY_DISABLED: '1',
    },
  })
  if (r.status !== 0) throw new Error(`[stacks-bench] ${argv.join(' ')} failed in ${cwd}`)
}

/** True when node_modules is missing or older than the lockfile it was installed from. */
function installIsStale(dir: string): boolean {
  const marker = join(dir, 'node_modules', '.package-lock.json')
  if (!existsSync(marker)) return true

  return statSync(join(dir, 'package-lock.json')).mtimeMs > statSync(marker).mtimeMs
}

function setUp(dir: string, m: StackManifest): void {
  if (copyData) copyFileSync(join(ROOT, 'shared', 'data.ts'), join(dir, m.dataFile))
  if (m.id === 'zero' && zero === 'workspace') {
    // An install in the arm would shadow the workspace packages.
    rmSync(join(dir, 'node_modules'), { recursive: true, force: true })
    const vite = join(ROOT, 'node_modules', '.bin', 'vite')
    if (!existsSync(vite)) {
      throw new Error('[stacks-bench] --zero=workspace needs `bun install` at the repo root first')
    }
    sh(dir, [vite, 'build'])

    return
  }
  const install = m.install ?? ['npm', 'ci', '--no-audit', '--no-fund']
  if (reinstall || installIsStale(dir)) {
    // devDependencies are build tools: install them even though NODE_ENV=production.
    sh(dir, [...install, ...(install[0] === 'npm' ? ['--include=dev'] : [])])
  }
  sh(dir, m.build)
}

assertNode(nodeVersion())
for (const { dir, m } of loadStacks(ids)) {
  console.log(`▸ ${m.id}${m.id === 'zero' ? ` (@pyreon/* from ${zero})` : ''}`)
  setUp(dir, m)
}
