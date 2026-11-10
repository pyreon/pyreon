#!/usr/bin/env bun
/**
 * Install and build the arms: `bun setup.ts [stackId…] [--copy-data] [--reinstall]`.
 *
 * Each rival arm has its own package.json + package-lock.json and is installed
 * with `npm ci` in its own directory (outside the root bun workspace, so a
 * normal `bun install` never downloads any of it). The zero arm resolves
 * `@pyreon/*` from the workspace's built lib/ and needs no install.
 *
 * --copy-data  re-copy shared/data.ts into every arm (the harness refuses a drifted copy)
 * --reinstall  run the install even when node_modules exists
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadStacks, ROOT } from './lib/stacks'

const args = process.argv.slice(2)
const ids = args.filter((a) => !a.startsWith('--'))
const copyData = args.includes('--copy-data')
const reinstall = args.includes('--reinstall')

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

for (const { dir, m } of loadStacks(ids)) {
  console.log(`▸ ${m.id}`)
  if (copyData) copyFileSync(join(ROOT, 'shared', 'data.ts'), join(dir, m.dataFile))
  const install = m.install ?? ['npm', 'ci', '--no-audit', '--no-fund']
  if (reinstall || !existsSync(join(dir, 'node_modules'))) {
    // devDependencies are build tools: install them even though NODE_ENV=production.
    sh(dir, [...install, ...(install[0] === 'npm' ? ['--include=dev'] : [])])
  }
  sh(dir, m.build)
}
