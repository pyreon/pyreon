/**
 * Install a workspace package into a consumer's `node_modules` AS PUBLISHED.
 *
 * `scripts/publish.ts` rewrites a manifest before packing: the `bun` export
 * condition is stripped (so `@pyreon/x/ui` resolves to `lib/`), and `src` is
 * dropped from `files` for a package that builds to `lib/`. A test that runs a
 * tool from the workspace sees neither, so a shipped file importing
 * `../../src/ui` worked here and failed in every install (`loom build`, and
 * `atlas build` until it was caught).
 *
 * This applies the same rewrite (the same functions publish.ts calls), packs
 * with `npm pack` (npm decides what `files` ships, exactly as on publish),
 * and extracts the tarball to `target`. The package's own dependencies are
 * not re-installed: `target/node_modules` links to the workspace package's
 * isolated `node_modules`, which holds what its manifest declares.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { packageBuildsToLib, stripBunCondition, stripSrcFromFiles } from './strip-bun-condition'

export function installPublished(pkgDir: string, target: string): void {
  const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as Record<string, unknown> &
    Parameters<typeof packageBuildsToLib>[0]
  const published = {
    ...manifest,
    ...(manifest.exports ? { exports: stripBunCondition(manifest.exports) } : {}),
    ...(Array.isArray(manifest.files) && packageBuildsToLib(manifest) ? { files: stripSrcFromFiles(manifest.files) } : {}),
  }
  const work = mkdtempSync(join(tmpdir(), 'pyreon-publish-'))
  try {
    const stage = join(work, 'stage')
    cpSync(pkgDir, stage, {
      recursive: true,
      filter: (src) => !src.includes(`${sep}node_modules`) && !src.endsWith(`${sep}.cache`),
    })
    writeFileSync(join(stage, 'package.json'), JSON.stringify(published, null, 2))
    execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', work], { cwd: stage, stdio: 'ignore' })
    const tarball = readdirSync(work).find((f) => f.endsWith('.tgz'))
    if (!tarball) throw new Error(`[Pyreon] emulate-published-install: npm pack produced no tarball for ${pkgDir}`)
    mkdirSync(target, { recursive: true })
    execFileSync('tar', ['-xzf', join(work, tarball), '-C', target, '--strip-components=1'])
    symlinkSync(join(pkgDir, 'node_modules'), join(target, 'node_modules'), 'dir')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

// CLI: `bun scripts/emulate-published-install.ts <package dir> <target dir>`.
// Package tests call it as a subprocess (a package's typecheck cannot reach
// into `scripts/`).
if (import.meta.main) {
  const [pkgDir, target] = process.argv.slice(2)
  if (!pkgDir || !target) {
    console.error('usage: bun scripts/emulate-published-install.ts <package dir> <target dir>')
    process.exit(1)
  }
  installPublished(pkgDir, target)
}
