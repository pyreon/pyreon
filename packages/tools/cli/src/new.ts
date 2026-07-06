/**
 * `pyreon new [name] [flags]` — scaffold a new Pyreon project.
 *
 * A thin, dependency-free delegator to the `create-*` scaffolders (so the CLI
 * doesn't bundle their prompt/template weight): it runs `@pyreon/create-zero`
 * for a web/full-stack app, or `@pyreon/create-multiplatform` with `--native`.
 * All other args (project name, `--template`, etc.) pass straight through to
 * the scaffolder, which owns the interactive flow.
 *
 * The point is discoverability + a single front door: `pyreon new` sits next
 * to `pyreon add` / `pyreon doctor` instead of a separately-remembered
 * `npm create @pyreon/zero`.
 */
import { execFileSync } from 'node:child_process'

export interface NewOptions {
  /** Args after `new`, with `--native`/`--dry-run` already extracted. */
  args: string[]
  native: boolean
  dryRun: boolean
}

/** The `npx` argv that scaffolds the project. Pure — unit-testable. */
export function buildScaffolderArgs(opts: Pick<NewOptions, 'native' | 'args'>): string[] {
  const pkg = opts.native ? '@pyreon/create-multiplatform' : '@pyreon/create-zero'
  // `@latest` so a new project always starts on the freshest templates,
  // independent of how old the globally-installed `@pyreon/cli` is.
  return ['--yes', `${pkg}@latest`, ...opts.args]
}

export function runNew(opts: NewOptions): number {
  const npxArgs = buildScaffolderArgs(opts)
  if (opts.dryRun) {
    console.log(`npx ${npxArgs.join(' ')}`)
    return 0
  }
  try {
    // Inherit stdio so the scaffolder's interactive prompts work.
    execFileSync('npx', npxArgs, { stdio: 'inherit' })
    return 0
  } catch (err) {
    const status = (err as { status?: number }).status
    return typeof status === 'number' ? status : 1
  }
}
