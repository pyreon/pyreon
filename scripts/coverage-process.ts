import { spawn } from 'node:child_process'

export interface CoverageExecution {
  output: string
  code: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  error?: string
}

/** Capture Vitest output with a deadline that also covers inherited pipes. */
export function captureCoverageProcess(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<CoverageExecution> {
  return new Promise((resolve) => {
    const grouped = process.platform !== 'win32'
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      // A private POSIX group lets us terminate Vitest's workers/compilers,
      // even after their parent exits. Never target an ambient process group.
      detached: grouped,
    })
    const result: CoverageExecution = { output: '', code: null, signal: null, timedOut: false }
    let settled = false
    let escalation: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      clearTimeout(escalation)
      child.stdout.destroy()
      child.stderr.destroy()
      resolve({ ...result })
    }
    const terminate = (signal: NodeJS.Signals) => {
      if (!child.pid) return
      try {
        if (grouped) process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') result.error = String(error)
      }
    }
    const deadline = setTimeout(() => {
      result.timedOut = true
      terminate('SIGTERM')
      // TERM is advisory. Also bound the wait for `close`: grandchildren can
      // keep stdout/stderr open after the direct child has already exited.
      escalation = setTimeout(() => {
        terminate('SIGKILL')
        finish()
      }, 1_000)
    }, options.timeoutMs)
    child.stdout.on('data', (data: Buffer) => {
      result.output += data.toString()
    })
    child.stderr.on('data', (data: Buffer) => {
      result.output += data.toString()
    })
    child.on('exit', (code, signal) => {
      result.code = code
      result.signal = signal
    })
    child.on('close', () => {
      // Finish timeout cleanup even if TERM made the direct child close;
      // a descendant that ignores TERM still needs the group escalation.
      if (!result.timedOut) finish()
    })
    child.on('error', (error) => {
      result.error = String(error)
      if (!result.timedOut) finish()
    })
  })
}
