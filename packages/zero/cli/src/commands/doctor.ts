import { resolve } from 'node:path'

export interface DoctorOptions {
  fix?: boolean
  json?: boolean
  ci?: boolean
  full?: boolean
}

export async function doctor(root: string | undefined, options: DoctorOptions) {
  try {
    const { doctor: runDoctor } = await import('@pyreon/cli')
    const cwd = resolve(root ?? '.')
    const errorCount = await runDoctor({
      fix: options.fix ?? false,
      json: options.json ?? false,
      ci: options.ci ?? false,
      // `zero doctor` prints "audit-types (enable with --full)" in its Skipped
      // list; without forwarding this the flag was unreachable (and cac threw
      // `Unknown option --full` before the action ran). See index.ts where the
      // option is registered.
      full: options.full ?? false,
      cwd,
    })
    if (options.ci && errorCount > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('Doctor failed:', (error as Error).message)
    process.exit(1)
  }
}
