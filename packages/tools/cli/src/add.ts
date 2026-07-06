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
import { ADD_RECIPES } from './add-recipes'

export interface AddOptions {
  packages: string[]
  cwd: string
  dryRun: boolean
  json: boolean
}

// ESC computed so the SOURCE carries no raw C0 control byte (source-hygiene gate).
const ESC = String.fromCharCode(27)
const useColor = (): boolean => !!process.stdout.isTTY && !process.env.NO_COLOR
const paint = (s: string, c: string): string => (useColor() ? `${ESC}[${c}m${s}${ESC}[0m` : s)
const bold = (s: string) => paint(s, '1')
const dim = (s: string) => paint(s, '2')
const red = (s: string) => paint(s, '31')
const green = (s: string) => paint(s, '32')
const cyan = (s: string) => paint(s, '36')

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
    console.error(red('  pyreon add <pkg...> — nothing to add. Example: `pyreon add query toast`'))
    return 1
  }

  const names = opts.packages.map(normalizePackageName)
  const nonPyreon = names.filter((n) => !n.startsWith('@pyreon/'))
  if (nonPyreon.length > 0) {
    console.error(
      red(`  pyreon add is for @pyreon/* packages; got ${nonPyreon.join(', ')}.`) +
        dim(`\n  Use your package manager directly for third-party packages.`),
    )
    return 1
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

  // ── Install ────────────────────────────────────────────────────────────────
  console.log(`\n  ${bold('Installing')} ${names.map((n) => cyan(n)).join(', ')} ${dim(`(${pm.name})`)}`)
  console.log(`  ${dim('$')} ${installCmd.join(' ')}`)
  if (opts.dryRun) {
    console.log(dim('  (--dry-run — not installed)'))
  } else {
    try {
      execFileSync(pm.name, [...pm.addArgs, ...names], { cwd: opts.cwd, stdio: 'inherit' })
    } catch {
      console.error(red(`\n  Install failed. Run manually: ${installCmd.join(' ')}`))
      return 1
    }
  }

  // ── Setup guidance ───────────────────────────────────────────────────────────
  for (const name of names) {
    const recipe = ADD_RECIPES[name]
    console.log(`\n  ${bold(cyan(name))}${recipe ? dim(` — ${recipe.summary}`) : ''}`)
    if (!recipe) {
      console.log(dim(`  Installed. See https://pyreon.dev/docs for setup.`))
      continue
    }
    if (recipe.provider) {
      console.log(`  ${bold('1.')} Add the provider near your app root:`)
      console.log(indent(recipe.provider.setup, green))
      console.log(indent(recipe.provider.wrap, green))
      console.log(`  ${bold('2.')} Use it:`)
    } else {
      console.log(`  ${bold('Use it:')}`)
    }
    console.log(indent(recipe.usage, green))
    console.log(`  ${dim('Docs:')} https://pyreon.dev${recipe.docs}`)
  }
  return 0
}

function indent(code: string, color: (s: string) => string): string {
  return code
    .split('\n')
    .map((l) => `      ${color(l)}`)
    .join('\n')
}
