/**
 * Tests for the default-on `@pyreon/*` dedupe (PR B of the bullet-proof
 * cross-module-instance plan).
 *
 * The vite-plugin injects `resolve.dedupe: <transitive @pyreon/*>` so the
 * bundler resolves every `@pyreon/*` import to ONE copy regardless of how
 * the import chain looks. This eliminates the dual-load bug class at the
 * BUNDLER LAYER — the singleton sentinel (PR A) is the DETECTION layer
 * for anything dedupe misses (consumer overrode dedupe, non-Vite bundler,
 * intentional dual-load).
 *
 * Two surfaces tested:
 *   1. `scanPyreonDepsTransitive(root)` — walks `node_modules/@pyreon` to
 *      capture the FULL transitive @pyreon/* set (the original
 *      `scanPyreonDeps()` reads `package.json` only and misses
 *      transitive deps).
 *   2. The plugin's `config()` hook injects `resolve.dedupe` from that
 *      list, OR an empty array when `PYREON_DISABLE_DEDUPE=1` (escape
 *      hatch for legitimate dual-load).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import pyreonPlugin from '../index'

let fixtureRoot: string
let originalDisable: string | undefined

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'pyreon-dedupe-fixture-'))
  originalDisable = process.env.PYREON_DISABLE_DEDUPE
  delete process.env.PYREON_DISABLE_DEDUPE
})

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true })
  if (originalDisable === undefined) delete process.env.PYREON_DISABLE_DEDUPE
  else process.env.PYREON_DISABLE_DEDUPE = originalDisable
})

function seedNodeModules(root: string, packages: string[]): void {
  const dir = join(root, 'node_modules', '@pyreon')
  mkdirSync(dir, { recursive: true })
  for (const p of packages) {
    mkdirSync(join(dir, p), { recursive: true })
    writeFileSync(
      join(dir, p, 'package.json'),
      JSON.stringify({ name: `@pyreon/${p}`, version: '0.24.6' }),
    )
  }
}

function writePackageJson(
  root: string,
  deps: Record<string, string>,
): void {
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '0.0.0', dependencies: deps }),
  )
}

function invokeConfigHook(root: string): Record<string, unknown> {
  const plugin = pyreonPlugin()
  // @ts-expect-error — vitest invokes the plugin's config hook directly.
  const result = plugin.config({ root }, { command: 'build' })
  return result as Record<string, unknown>
}

describe('PR B — transitive @pyreon/* dedupe', () => {
  describe('scanPyreonDepsTransitive — via config hook', () => {
    it('captures transitive deps NOT in the consumer package.json', () => {
      // Consumer declares only @pyreon/zero; transitive deps are pulled by it.
      writePackageJson(fixtureRoot, { '@pyreon/zero': 'workspace:^' })
      seedNodeModules(fixtureRoot, [
        'zero',
        'core',
        'router',
        'runtime-dom',
        'reactivity',
      ])

      const config = invokeConfigHook(fixtureRoot)
      const resolve = config.resolve as { dedupe?: string[] }

      // Every name under node_modules/@pyreon is in dedupe (including
      // transitive ones the consumer never declared).
      expect(resolve.dedupe).toBeDefined()
      expect(resolve.dedupe).toContain('@pyreon/zero')
      expect(resolve.dedupe).toContain('@pyreon/core')
      expect(resolve.dedupe).toContain('@pyreon/router')
      expect(resolve.dedupe).toContain('@pyreon/runtime-dom')
      expect(resolve.dedupe).toContain('@pyreon/reactivity')
    })

    it('returns names in stable sorted order — deterministic builds', () => {
      writePackageJson(fixtureRoot, {})
      seedNodeModules(fixtureRoot, ['zero', 'core', 'reactivity', 'router'])

      const config = invokeConfigHook(fixtureRoot)
      const resolve = config.resolve as { dedupe?: string[] }

      expect(resolve.dedupe).toEqual([
        '@pyreon/core',
        '@pyreon/reactivity',
        '@pyreon/router',
        '@pyreon/zero',
      ])
    })

    it('walks up to find node_modules from a nested project root', () => {
      // Simulate workspace: node_modules at outer root, project root nested.
      seedNodeModules(fixtureRoot, ['zero', 'core'])
      const nestedRoot = join(fixtureRoot, 'apps', 'web')
      mkdirSync(nestedRoot, { recursive: true })
      writePackageJson(nestedRoot, { '@pyreon/zero': 'workspace:^' })

      const config = invokeConfigHook(nestedRoot)
      const resolve = config.resolve as { dedupe?: string[] }

      expect(resolve.dedupe).toContain('@pyreon/zero')
      expect(resolve.dedupe).toContain('@pyreon/core')
    })
  })

  describe('config-hook injection — default-on', () => {
    it('always sets resolve.conditions: ["bun"]', () => {
      writePackageJson(fixtureRoot, {})
      const config = invokeConfigHook(fixtureRoot)
      const resolve = config.resolve as { conditions: string[] }
      expect(resolve.conditions).toEqual(['bun'])
    })

    it('omits resolve.dedupe entirely when node_modules has no @pyreon dir', () => {
      // Fresh project before `bun install` — no node_modules/@pyreon yet.
      writePackageJson(fixtureRoot, {})
      const config = invokeConfigHook(fixtureRoot)
      const resolve = config.resolve as { dedupe?: string[]; conditions: string[] }
      // Conditions still set; dedupe is absent (nothing to dedupe).
      expect(resolve.conditions).toEqual(['bun'])
      expect(resolve.dedupe).toBeUndefined()
    })

    it('omits resolve.dedupe under PYREON_DISABLE_DEDUPE=1 even when @pyreon/* present', () => {
      process.env.PYREON_DISABLE_DEDUPE = '1'
      writePackageJson(fixtureRoot, {})
      seedNodeModules(fixtureRoot, ['zero', 'core', 'reactivity'])

      const config = invokeConfigHook(fixtureRoot)
      const resolve = config.resolve as { dedupe?: string[] }

      // Escape hatch fires — dedupe NOT injected.
      expect(resolve.dedupe).toBeUndefined()
    })
  })

  describe('regression — bug class the dedupe prevents', () => {
    it('includes a transitive @pyreon/* that does NOT appear in package.json — the gap PR B closes', () => {
      // Real-world shape: user installed @pyreon/zero. Their package.json
      // has no @pyreon/core in it. But @pyreon/core IS at node_modules/
      // @pyreon/core via transitive resolution. Pre-PR-B's
      // `scanPyreonDeps()` returned ['@pyreon/zero'] only — Vite then had
      // no dedupe hint for @pyreon/core, which could be loaded twice via
      // resolver divergence (the bug class). Now @pyreon/core IS in
      // dedupe because we walk node_modules.
      writePackageJson(fixtureRoot, { '@pyreon/zero': 'workspace:^' })
      seedNodeModules(fixtureRoot, ['zero', 'core', 'reactivity', 'router'])

      const config = invokeConfigHook(fixtureRoot)
      const resolve = config.resolve as { dedupe?: string[] }

      // @pyreon/core is in dedupe DESPITE not appearing in dependencies.
      // This is the central transitive-coverage claim of PR B.
      expect(resolve.dedupe).toContain('@pyreon/core')
      expect(resolve.dedupe).toContain('@pyreon/reactivity')
      expect(resolve.dedupe).toContain('@pyreon/router')
    })
  })
})
