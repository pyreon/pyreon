#!/usr/bin/env bun
/**
 * Generated client code that has drifted from its spec is a lie the compiler
 * cannot catch.
 *
 * `@pyreon/lathe` generates a typed client from an OpenAPI spec and the output
 * is COMMITTED — so an edit to `openapi.yaml` without a regeneration leaves the
 * repo describing an API that no longer exists. Nothing else notices: the stale
 * client typechecks perfectly against itself, its tests pass, and the mismatch
 * surfaces as a runtime 404 or a decode failure far from the edit.
 *
 * `lathe check` is the command for exactly this — it regenerates in memory,
 * compares, and fails on any difference, the same shape as `gen-docs --check`.
 * It shipped documented as "the CI half" and nothing ran it, which is the
 * `check-gates-wired` class one layer out: that gate scans for `check-*.ts`
 * scripts with no runner, so a gate that is a CLI SUBCOMMAND is invisible to
 * it. This script is the missing runner, and being a `check-*.ts` it is itself
 * covered by that gate from now on.
 *
 * ## Scope
 *
 * Every workspace carrying a `pyreon.config.*` with a `lathe` section. An
 * EMPTY scan fails rather than passes: "we found nothing to check" and "the
 * generated output is current" are different answers, and reporting the second
 * for the first is how a gate quietly stops protecting anything.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
// The generator is imported from SOURCE, not spawned through `bin/lathe.js`.
// The bin loads `lib/`, so against an unbuilt tree it runs the PREVIOUS
// generator and reports the committed output as current — a false GREEN, which
// is the worst outcome a staleness gate can produce. Observed while writing
// this: an emitter change made the example's output stale and the spawning
// version of this gate said "current". Testing the shipped bin is a separate
// concern that `check-bin-liveness` already owns.
import { main as latheMain } from '../packages/tools/lathe/src/cli/main'

const REPO_ROOT = resolve(import.meta.dir, '..')
const CONFIG_NAMES = ['pyreon.config.ts', 'pyreon.config.js', 'pyreon.config.mjs']

/** Directories to scan for a lathe-configured workspace. */
const ROOTS = ['examples', 'packages/tools', 'packages/zero', 'docs']

function latheWorkspaces(): string[] {
  const found: string[] = []
  for (const root of ROOTS) {
    const abs = join(REPO_ROOT, root)
    if (!existsSync(abs)) continue
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(abs, entry.name)
      for (const name of CONFIG_NAMES) {
        const cfg = join(dir, name)
        if (!existsSync(cfg)) continue
        // A `lathe` key, not merely a config file — most of these workspaces
        // carry one for other tools.
        if (/\blathe\s*:/.test(readFileSync(cfg, 'utf8'))) found.push(dir)
        break
      }
    }
  }
  return found
}

const workspaces = latheWorkspaces()
if (workspaces.length === 0) {
  console.error(
    '[check-lathe-fresh] ✗ found NO workspace with a `lathe` config section.\n' +
      '  That is a failure, not a pass: this gate exists to compare committed\n' +
      '  generated output against its spec, and it just compared nothing. If\n' +
      '  lathe genuinely has no consumer in this repo, delete this gate.',
  )
  process.exit(1)
}

const stale: string[] = []
for (const dir of workspaces) {
  const rel = dir.slice(REPO_ROOT.length + 1)
  // Capture at `process.stdout.write`, not `console.log`: the CLI renders its
  // report by writing to the stream directly, so a console-level capture lets
  // the whole thing through and the gate's own message is buried under it.
  const captured: string[] = []
  const realOut = process.stdout.write.bind(process.stdout)
  const realErrWrite = process.stderr.write.bind(process.stderr)
  const grab = (chunk: unknown): boolean => {
    captured.push(String(chunk))
    return true
  }
  process.stdout.write = grab as typeof process.stdout.write
  process.stderr.write = grab as typeof process.stderr.write
  let code: number
  try {
    code = await latheMain(['check'], dir)
  } finally {
    process.stdout.write = realOut
    process.stderr.write = realErrWrite
  }
  if (code === 0) console.log(`  ✓ ${rel}`)
  else {
    // Strip ANSI so the gate's own failure text stays readable in a CI log.
    const detail = captured
      .join('')
      // oxlint-disable-next-line no-control-regex -- stripping SGR sequences
      .replace(/\u001B\[[0-9;]*m/g, '')
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0)
      .map((l) => `      ${l}`)
      .join('\n')
    stale.push(`${rel}\n${detail}`)
  }
}

if (stale.length > 0) {
  console.error(
    `[check-lathe-fresh] ✗ generated client code is STALE in ${stale.length} workspace(s):\n\n` +
      stale.map((s) => `  ${s}`).join('\n\n') +
      '\n\n  Fix: run `lathe generate` in that workspace and commit the result.',
  )
  process.exit(1)
}

console.log(`[check-lathe-fresh] ✓ generated client code current in ${workspaces.length} workspace(s)`)
