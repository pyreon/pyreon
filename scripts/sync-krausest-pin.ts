#!/usr/bin/env bun
/**
 * Pin `contrib/krausest/pyreon-keyed` to the newest PUBLISHED Pyreon release
 * and regenerate its `package-lock.json` with npm.
 *
 * That directory is the entry staged for the independent
 * krausest/js-framework-benchmark. Upstream requires exact dependency
 * versions and builds with `npm ci`, so the entry carries a lockfile, and a
 * lockfile can only name a version npm already serves. The release PR bumps
 * the workspace version before anything is published, so this script pins the
 * newest version that IS published: the workspace version when it is out,
 * otherwise the release before it. `check-krausest-entry.ts` accepts exactly
 * those two, so the entry trails the workspace by at most one release and a
 * release PR never turns red on it.
 *
 * It runs as part of `version-packages`, so each release PR moves the pin to
 * the release published just before it. Run it by hand before submitting
 * upstream to move the pin to the current release.
 *
 * It is not a workspace member (`workspace:*` cannot resolve once the
 * directory is copied into the upstream repository), so `changeset version`
 * never touches it. Without this script the pin sat at `^0.38.0` through ten
 * releases; submitting that would have published a Pyreon older than shipped
 * code as the independent result.
 *
 * When npm cannot be reached and the current pin is still acceptable, it
 * leaves the entry alone and exits 0, so a network failure cannot fail a
 * release. Every other failure exits 1.
 *
 * Usage: bun scripts/sync-krausest-pin.ts
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  acceptablePins,
  checkLockfile,
  checkPackageJson,
  ENTRY_DIR,
  type EntryLockfile,
  type EntryPackageJson,
  pinnedPyreonVersion,
  VERSION_SOURCE_DIR,
} from './check-krausest-entry'

const PACKAGE_JSON = join(ENTRY_DIR, 'package.json')
const LOCKFILE = join(ENTRY_DIR, 'package-lock.json')

type Published = 'yes' | 'no' | 'unknown'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
const readLock = (): EntryLockfile | undefined => (existsSync(LOCKFILE) ? readJson<EntryLockfile>(LOCKFILE) : undefined)

const pyreonDeps = (pkg: EntryPackageJson): string[] =>
  Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((name) => name.startsWith('@pyreon/'))

/** Does npm serve `name@version`? `unknown` when the registry cannot be asked. */
function isPublished(name: string, version: string): Published {
  const result = spawnSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf8' })
  if (result.status === 0) return result.stdout.trim() === version ? 'yes' : 'no'
  return /E404|is not in this registry/.test(result.stderr) ? 'no' : 'unknown'
}

/** A release counts as published only when EVERY package the entry uses is out (a partial publish is not). */
function releasePublished(names: readonly string[], version: string): Published {
  for (const name of names) {
    const state = isPublished(name, version)
    if (state !== 'yes') return state
  }
  return 'yes'
}

function writePin(pkg: EntryPackageJson, version: string): void {
  for (const section of [pkg.dependencies, pkg.devDependencies]) {
    for (const name of Object.keys(section ?? {})) {
      if (name.startsWith('@pyreon/')) section![name] = version
    }
  }
  writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`)
}

/** npm resolves the lockfile without installing anything or running a package script. */
function regenerateLockfile(): void {
  const result = spawnSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: ENTRY_DIR,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    console.error(`[krausest-pin] ✗ npm could not write the lockfile (exit ${result.status}). Fix the error above and re-run.`)
    process.exit(1)
  }
}

function main(): void {
  const pkg = readJson<EntryPackageJson>(PACKAGE_JSON)
  const workspaceVersion = readJson<{ version: string }>(join(VERSION_SOURCE_DIR, 'package.json')).version
  const candidates = acceptablePins(workspaceVersion, readFileSync(join(VERSION_SOURCE_DIR, 'CHANGELOG.md'), 'utf8'))
  const current = pinnedPyreonVersion(pkg)
  const consistent = (): boolean => checkPackageJson(pkg).length === 0 && checkLockfile(pkg, readLock()).length === 0

  if (current === workspaceVersion && consistent()) {
    console.log(`[krausest-pin] already at ${current} with a matching lockfile — no change`)
    return
  }

  let target: string | undefined
  for (const version of candidates) {
    const state = releasePublished(pyreonDeps(pkg), version)
    if (state === 'yes') {
      target = version
      break
    }
    if (state === 'unknown') {
      if (current !== undefined && candidates.includes(current) && consistent()) {
        console.log(`[krausest-pin] npm is unreachable; keeping the ${current} pin, which is still acceptable`)
        return
      }
      console.error('[krausest-pin] ✗ npm is unreachable and the entry needs a new pin or lockfile. Re-run with network access.')
      process.exit(1)
    }
    console.log(`[krausest-pin] ${version} is not on npm yet`)
  }
  if (target === undefined) {
    console.error(`[krausest-pin] ✗ none of ${candidates.join(', ')} is published on npm, so there is nothing the lockfile could name.`)
    process.exit(1)
  }

  if (target === current && consistent()) {
    console.log(`[krausest-pin] already at ${current}, the newest published release — no change`)
    return
  }
  writePin(pkg, target)
  regenerateLockfile()
  const problems = [...checkPackageJson(pkg), ...checkLockfile(pkg, readLock())]
  if (problems.length > 0) {
    for (const problem of problems) console.error(`[krausest-pin] ✗ ${problem}`)
    process.exit(1)
  }
  console.log(`[krausest-pin] pinned @pyreon/* to ${target} and regenerated package-lock.json`)
  console.log('[krausest-pin] re-run upstream\'s checks before submitting: .agents/guides/benchmarks/references/krausest-submission.md')
}

if (import.meta.main) main()
