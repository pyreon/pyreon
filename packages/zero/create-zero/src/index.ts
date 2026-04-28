import * as p from '@clack/prompts'
import { type CliArgs, helpText, parseArgs } from './args'
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

async function main() {
  const invokedAs = detectInvocation()

  let args: CliArgs
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(2)
  }

  if (args.help) {
    console.log(helpText(invokedAs))
    process.exit(0)
  }

  p.intro(invokedAs === 'create-pyreon-app' ? 'Create a new Pyreon project' : 'Pyreon Zero')

  const config = await runPrompts(args)

  const s = p.spinner()
  s.start('Scaffolding project...')

  await scaffold(config)

  s.stop('Project created!')

  // Next steps
  p.note([`cd ${config.name}`, 'bun install', 'bun run dev'].join('\n'), 'Next steps')

  p.outro('Happy building!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
