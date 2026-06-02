// `create-multiplatform` CLI — scaffolds a new web + iOS + Android Pyreon
// project sharing one `src/App.tsx`. Thin I/O wrapper over `buildScaffold`
// (the pure generator in `scaffold.ts`, which holds all templates + is
// unit-tested in isolation).
//
// Usage:
//   npx create-multiplatform <project-name>
//   npx create-multiplatform my-app --dir ./apps/my-app
//
// Phase D4 (native readiness audit 2026-06): adds name + dir validation
// to prevent broken scaffolds. Scout-8's audit finding: "no
// kebab-case validation, no existing-dir check."

import { existsSync, readdirSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { buildScaffold } from './scaffold'

export interface CliArgs {
  name: string
  dir: string
}

/**
 * Phase D4 — validate a project name as kebab-case (lower-case alpha-
 * num + hyphens). Mirrors npm's package-name validation (a subset —
 * we don't allow scopes or dots since the name flows into Xcode
 * project names + Gradle module names that have stricter rules).
 *
 * Rules:
 *   - 1-50 chars
 *   - starts with a lowercase letter
 *   - lowercase letters, digits, hyphens only
 *   - no consecutive hyphens (`--`)
 *   - no trailing hyphen
 *
 * Throws with an actionable message on failure. The message names
 * the offending input so the user can copy-paste-fix.
 */
export function validateProjectName(name: string): void {
  if (name.length === 0) {
    throw new Error('Project name cannot be empty.')
  }
  if (name.length > 50) {
    throw new Error(
      `Project name "${name}" is ${name.length} characters; max 50. Pick something shorter — names propagate to Xcode project + Gradle module IDs that have practical length limits.`,
    )
  }
  if (!/^[a-z]/.test(name)) {
    throw new Error(
      `Project name "${name}" must start with a lowercase letter. Native targets (Xcode + Gradle) reject leading digits/special chars. Try "${suggestKebab(name)}" instead.`,
    )
  }
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/.test(name)) {
    throw new Error(
      `Project name "${name}" must be lowercase kebab-case (letters, digits, hyphens; no trailing hyphen). Try "${suggestKebab(name)}" instead.`,
    )
  }
  if (name.includes('--')) {
    throw new Error(
      `Project name "${name}" contains consecutive hyphens. Use single hyphens between words: "${suggestKebab(name)}".`,
    )
  }
}

/**
 * Phase D4 helper — suggest a fixed kebab-case name from arbitrary
 * input. Used in error messages so the user has an actionable
 * "did you mean?" alternative.
 *
 * Strips invalid leading chars, lowercases, replaces invalid chars
 * with hyphens, collapses double-hyphens, trims trailing hyphens.
 */
export function suggestKebab(input: string): string {
  let s = input.toLowerCase()
  s = s.replace(/[^a-z0-9-]+/g, '-')
  s = s.replace(/^[^a-z]+/, '') // strip leading non-letters
  s = s.replace(/-+/g, '-')
  s = s.replace(/-+$/, '')
  s = s.slice(0, 50) // truncate to max length
  return s.length > 0 ? s : 'my-app'
}

/**
 * Phase D4 — refuse to scaffold into an existing non-empty directory.
 * Prevents accidentally overwriting in-progress work or polluting
 * an existing project's tree.
 *
 * Empty dirs are fine (e.g. `mkdir my-app && cd my-app && npx
 * create-multiplatform .`). Nonexistent dirs are fine (will be
 * created by writeScaffold's mkdir-recursive call). Only the
 * "dir exists AND has files" case is rejected.
 */
export function validateTargetDir(targetDir: string): void {
  const resolved = resolve(targetDir)
  if (!existsSync(resolved)) return // doesn't exist yet — writeScaffold will mkdir
  try {
    const entries = readdirSync(resolved).filter(
      // Allow common metadata-only dirs that often exist in a fresh
      // mkdir-then-cd flow (.git initialized but no commits yet, etc.).
      (e) => e !== '.git' && e !== '.DS_Store',
    )
    if (entries.length > 0) {
      throw new Error(
        `Target directory "${resolved}" already exists and is non-empty (${entries.length} entry/entries: ${entries.slice(0, 3).join(', ')}${entries.length > 3 ? ', ...' : ''}). Refusing to overwrite — pick a new --dir or remove the existing contents first.`,
      )
    }
  } catch (err) {
    // readdirSync threw — likely a permission error. Re-throw with a
    // clearer message than the raw EACCES.
    if (err instanceof Error && err.message.startsWith('Target directory')) {
      throw err
    }
    throw new Error(
      `Cannot read target directory "${resolved}" (${err instanceof Error ? err.message : String(err)}). Check permissions.`,
    )
  }
}

/** Parse argv (after `node script`) into a name + target dir. */
export function parseArgs(argv: string[]): CliArgs {
  let name: string | undefined
  let dir: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dir' || a === '-d') {
      dir = argv[++i]
    } else if (a !== undefined && !a.startsWith('-') && name === undefined) {
      name = a
    }
  }
  if (name === undefined || name.length === 0) {
    throw new Error('Usage: create-multiplatform <project-name> [--dir <path>]')
  }
  return { name, dir: dir ?? name }
}

/** Write the scaffold's file tree under `targetDir`. */
export async function writeScaffold(name: string, targetDir: string): Promise<string[]> {
  const files = buildScaffold({ name })
  const root = resolve(targetDir)
  for (const f of files) {
    const full = join(root, f.path)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, f.content, 'utf8')
  }
  return files.map((f) => f.path)
}

export async function main(argv: string[]): Promise<void> {
  const { name, dir } = parseArgs(argv)
  // Phase D4: validate BEFORE writing — fail fast with actionable
  // error rather than producing a broken scaffold.
  validateProjectName(name)
  validateTargetDir(dir)
  const written = await writeScaffold(name, dir)
  // eslint-disable-next-line no-console
  console.log(
    `[create-multiplatform] scaffolded "${name}" → ${dir}/ (${written.length} files)\n` +
      `  next: cd ${dir} && npm install && npm run dev`,
  )
}
