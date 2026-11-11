import { readdirSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createTerm, finding, formatElapsed, plural } from '@pyreon/ansi'
import * as p from './ui'
import { type CliArgs, helpText, parseArgs } from './args'
import { OWN_VERSION } from './own-version'
import { detectPackageManager, nextSteps } from './package-manager'
import { runPrompts } from './prompts'
import { scaffold } from './scaffold'

/**
 * Detect which bin alias the user invoked. The same package ships two
 * entry points: `create-pyreon-app` (canonical, discoverable via
 * `bunx create-pyreon-app`) and `create-zero` (back-compat alias for
 * users following older docs / `bun create @pyreon/zero` flow).
 *
 * The --help text echoes the alias the user actually typed so docs
 * links and copy-paste invocations stay consistent.
 */
function detectInvocation(): 'create-pyreon-app' | 'create-zero' {
  const argv1 = process.argv[1] ?? ''
  // basename match — works whether invoked via absolute path, npm shim, or bunx
  return argv1.includes('create-pyreon-app') ? 'create-pyreon-app' : 'create-zero'
}

/** Files (not directories) under `dir`, recursively. */
function countFiles(dir: string): number {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length
}

async function main() {
  const invokedAs = detectInvocation()

  let args: CliArgs
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    const t = createTerm({ isTTY: process.stderr.isTTY === true })
    const message = err instanceof Error ? err.message : String(err)
    console.error(
      finding(t, { severity: 'error', source: invokedAs, message, fix: `run ${invokedAs} --help for usage` }, { indent: 0, width: t.width }).join('\n'),
    )
    process.exit(2)
  }

  if (args.help) {
    console.log(helpText(invokedAs))
    process.exit(0)
  }

  // Rule 1: the first line names what ran — the alias typed, and its version.
  p.intro(invokedAs, OWN_VERSION)

  const config = await runPrompts(args)

  const s = p.spinner()
  s.start('Scaffolding project...')

  // Only the scaffold itself is timed: the prompts before it wait on a person.
  const started = performance.now()
  await scaffold(config)
  const elapsed = performance.now() - started

  s.stop('Project scaffolded')

  // Next steps
  const pm = detectPackageManager(process.env.npm_config_user_agent)
  p.note(nextSteps(config.name, pm, config.template).join('\n'), 'Next steps')

  // The verdict: what was created, how many files are in it, how long it took.
  // `runPrompts` refuses an existing directory, so every file counted here
  // was written by this run.
  p.outro(`created ${config.name}`, {
    status: 'ok',
    meta: [plural(countFiles(config.targetDir), 'file'), formatElapsed(elapsed)],
  })
}

main().catch((err) => {
  // Ctrl-C at a prompt and a failed scaffold both land here; either way the
  // last line says what happened (rule 1), with the stack dim beneath.
  const t = createTerm({ isTTY: process.stderr.isTTY === true })
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error && err.stack ? err.stack.split('\n').filter((l) => /^\s+at /.test(l)) : []
  console.error(
    [
      ...finding(t, { severity: 'error', source: 'create-zero', message: `scaffold failed: ${message}` }, { indent: 0, width: t.width }),
      ...stack.map((l) => t.dim(`   ${l.trim()}`)),
    ].join('\n'),
  )
  process.exit(1)
})
