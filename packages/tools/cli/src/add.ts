/**
 * `pyreon add <pkg...>` — install one or more Pyreon packages and print the
 * exact setup to wire each one in (provider to add near the root + a usage
 * snippet), tailored per package from a curated recipe registry.
 *
 * It detects your package manager from the lockfile (bun / pnpm / yarn / npm)
 * so you don't have to remember which `add` command this project uses, and it
 * accepts bare names (`pyreon add query` == `pyreon add @pyreon/query`).
 *
 * `--dry-run` prints what it WOULD do without installing; `--json` emits a
 * machine-readable plan.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  createTerm,
  finding as findingLines,
  formatElapsed,
  header,
  plural,
  type Term,
  verdict,
} from '@pyreon/ansi'
import { ADD_RECIPES } from './add-recipes'

export interface AddOptions {
  packages: string[]
  cwd: string
  dryRun: boolean
  json: boolean
}

/** A usage or install error on stderr: `✗ pyreon add · problem`, then `fix:`. */
const fail = (message: string, fix: string): number => {
  const t = createTerm({ isTTY: Boolean(process.stderr.isTTY) })
  console.error(
    findingLines(t, { severity: 'error', source: 'pyreon add', message, fix }, { indent: 0, width: t.width }).join('\n'),
  )
  return 1
}

interface PackageManager {
  name: 'bun' | 'pnpm' | 'yarn' | 'npm'
  /** Args to install the given packages (prepended to the package list). */
  addArgs: string[]
}

/**
 * Detect the package manager from the nearest lockfile, walking up from `cwd`
 * (so it works from a subdirectory, like the package managers themselves).
 * Defaults to npm when no lockfile is found.
 */
export function detectPackageManager(cwd: string): PackageManager {
  let dir = cwd
  // eslint-disable-next-line no-constant-condition
  for (;;) {
    if (existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'bun.lockb'))) {
      return { name: 'bun', addArgs: ['add'] }
    }
    if (existsSync(join(dir, 'pnpm-lock.yaml'))) return { name: 'pnpm', addArgs: ['add'] }
    if (existsSync(join(dir, 'yarn.lock'))) return { name: 'yarn', addArgs: ['add'] }
    if (existsSync(join(dir, 'package-lock.json'))) return { name: 'npm', addArgs: ['install'] }
    const parent = dirname(dir)
    if (parent === dir) break // reached filesystem root
    dir = parent
  }
  return { name: 'npm', addArgs: ['install'] }
}

/** `query` → `@pyreon/query`; `@pyreon/query` → itself; other scopes pass through. */
export function normalizePackageName(input: string): string {
  if (input.startsWith('@')) return input
  return `@pyreon/${input}`
}

export function add(opts: AddOptions): number {
  if (opts.packages.length === 0) {
    return fail('nothing to add', 'name the packages: pyreon add query toast')
  }

  const names = opts.packages.map(normalizePackageName)
  const nonPyreon = names.filter((n) => !n.startsWith('@pyreon/'))
  if (nonPyreon.length > 0) {
    return fail(
      `pyreon add is for @pyreon/* packages; got ${nonPyreon.join(', ')}.`,
      'use your package manager directly for third-party packages',
    )
  }

  const pm = detectPackageManager(opts.cwd)
  const installCmd = [pm.name, ...pm.addArgs, ...names]

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          packages: names,
          packageManager: pm.name,
          command: installCmd.join(' '),
          dryRun: opts.dryRun,
          recipes: names.map((n) => ({ package: n, recipe: ADD_RECIPES[n] ?? null })),
        },
        null,
        2,
      ),
    )
    return 0
  }

  const started = performance.now()
  const t = createTerm()
  console.log(renderAddHeader(t, names, pm.name, installCmd.join(' ')))
  if (!opts.dryRun) {
    try {
      execFileSync(pm.name, [...pm.addArgs, ...names], { cwd: opts.cwd, stdio: 'inherit' })
    } catch {
      return fail('install failed', `run it yourself: ${installCmd.join(' ')}`)
    }
  }
  console.log(renderAddGuide(t, names, { dryRun: opts.dryRun, pm: pm.name, elapsedMs: performance.now() - started }))
  return 0
}

/** First lines: what runs (`pyreon add · names · pm`) and the exact install command. */
export const renderAddHeader = (t: Term, names: readonly string[], pm: string, command: string): string =>
  [header(t, 'pyreon add', `${names.join(', ')} ${t.sym('bullet')} ${pm}`), `  ${t.dim('$')} ${command}`].join('\n')

/**
 * After the install: per package, how to wire it in (provider, usage, docs
 * link), then the verdict. Code is printed uncoloured and unframed, so it
 * copies cleanly out of the terminal.
 */
export function renderAddGuide(
  t: Term,
  names: readonly string[],
  run: { dryRun: boolean; pm: string; elapsedMs: number },
): string {
  const lines: string[] = []
  for (const name of names) {
    const recipe = ADD_RECIPES[name]
    lines.push('', `  ${t.bold(name)}${recipe ? ` ${t.dim(`${t.sym('bullet')} ${recipe.summary}`)}` : ''}`)
    if (!recipe) {
      lines.push(`    no setup recipe yet ${t.dim(t.sym('dash'))} see the docs`)
      lines.push(`    ${t.dim('docs')}  ${t.info('https://pyreon.dev/docs')}`)
      continue
    }
    if (recipe.provider) {
      lines.push(`    ${t.accent('1.')} Add the provider near your app root:`)
      lines.push(indent(recipe.provider.setup), indent(recipe.provider.wrap))
      lines.push(`    ${t.accent('2.')} Use it:`)
    } else {
      lines.push(`    ${t.accent(t.sym('step'))} Use it:`)
    }
    lines.push(indent(recipe.usage))
    lines.push(`    ${t.dim('docs')}  ${t.info(`https://pyreon.dev${recipe.docs}`)}`)
  }
  lines.push('')
  lines.push(
    run.dryRun
      ? verdict(t, 'info', '--dry-run: nothing installed', [plural(names.length, 'package'), run.pm])
      : verdict(t, 'ok', `installed ${plural(names.length, 'package')}`, [run.pm, formatElapsed(run.elapsedMs)]),
  )
  return lines.join('\n')
}

function indent(code: string): string {
  return code
    .split('\n')
    .map((l) => `      ${l}`)
    .join('\n')
}
