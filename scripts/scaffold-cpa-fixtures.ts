#!/usr/bin/env bun
/**
 * scaffold-cpa-fixtures — regenerate the create-pyreon-app Playwright fixtures.
 *
 * The Playwright runtime gate (`bun run test:e2e:cpa`) targets three
 * pre-scaffolded fixture apps:
 *
 *   examples/cpa-pw-app   (template=app,       adapter=vercel)
 *   examples/cpa-pw-blog  (template=blog,      adapter=static)
 *   examples/cpa-pw-dash  (template=dashboard, adapter=vercel,
 *                         no integrations — exercises the in-memory stub)
 *
 * The fixtures are committed (not regenerated per-test-run) so:
 *   - CI doesn't pay scaffold + install time per run (already cached)
 *   - Devs can navigate / debug specific fixture files in the IDE
 *   - Spec assertions can rely on stable file paths
 *
 * Run this script when:
 *   - You change anything under `packages/zero/create-zero/templates/`
 *   - You change the scaffolder logic in `packages/zero/create-zero/src/`
 *   - You bump versions or change deps that affect generated `package.json`
 *
 * Usage:
 *   bun scripts/scaffold-cpa-fixtures.ts          # regenerate all 3
 *   bun scripts/scaffold-cpa-fixtures.ts --check  # exit non-zero if any drift
 */

import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

interface Fixture {
  /** Directory name under `examples/` */
  name: string
  /** create-pyreon-app flags */
  args: string[]
}

const FIXTURES: Fixture[] = [
  {
    name: 'cpa-pw-app',
    args: ['--template', 'app', '--adapter', 'vercel', '--yes'],
  },
  {
    name: 'cpa-pw-blog',
    args: ['--template', 'blog', '--adapter', 'static', '--yes'],
  },
  {
    name: 'cpa-pw-dash',
    // No integrations: tests the in-memory stub end-to-end. The
    // supabase-integrated dashboard requires a live backend / mock layer
    // that's Bucket C scope (separate PR).
    args: ['--template', 'dashboard', '--adapter', 'vercel', '--integrations', '', '--yes'],
  },
  // Compat-mode runtime fixtures — boot the scaffolded `app` template with
  // `pyreon({ compat: <x> })` and assert the framework still mounts +
  // renders + reacts in a real browser. Without these, the build-shape
  // smoke (`scripts/scaffold-smoke.ts`) only proves the build doesn't
  // crash — runtime correctness in compat mode is otherwise unverified.
  // Caught a workspace-dev OXC importSource bug whose fix is in the same PR.
  {
    name: 'cpa-pw-app-react',
    args: ['--template', 'app', '--adapter', 'vercel', '--compat', 'react', '--yes'],
  },
  {
    name: 'cpa-pw-app-vue',
    args: ['--template', 'app', '--adapter', 'vercel', '--compat', 'vue', '--yes'],
  },
  {
    name: 'cpa-pw-app-solid',
    args: ['--template', 'app', '--adapter', 'vercel', '--compat', 'solid', '--yes'],
  },
  {
    name: 'cpa-pw-app-preact',
    args: ['--template', 'app', '--adapter', 'vercel', '--compat', 'preact', '--yes'],
  },
]

const REPO_ROOT = resolve(import.meta.dir, '..')
const EXAMPLES_DIR = join(REPO_ROOT, 'examples')
const SCAFFOLDER = join(REPO_ROOT, 'packages/zero/create-zero/src/index.ts')

async function regenerate(fixture: Fixture): Promise<void> {
  const target = join(EXAMPLES_DIR, fixture.name)

  if (existsSync(target)) {
    await rm(target, { recursive: true, force: true })
  }

  console.log(`──── ${fixture.name} ────`)
  const result = spawnSync('bun', [SCAFFOLDER, fixture.name, ...fixture.args], {
    cwd: EXAMPLES_DIR,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`scaffolder exited with code ${result.status} for ${fixture.name}`)
  }
}

async function main(): Promise<void> {
  for (const fixture of FIXTURES) {
    await regenerate(fixture)
  }

  console.log('\n✓ Regenerated all CPA fixtures.')
  console.log('Run `bun install` to refresh workspace + bun.lock.')
  console.log('Then `bun run test:e2e:cpa` to verify the runtime gate.')
}

await main()
