/**
 * Failures from a zero command, in the shared `@pyreon/ansi` theme (rule 4):
 * `✗ zero build · Build failed: <message>`, `↳ file:line:col` when the error
 * carries a location (Vite / Rolldown errors do), `fix:` when there is one,
 * then the code frame and the stack in the dim role, so nothing that says
 * WHERE it failed is lost. Written to stderr.
 */
import { createTerm, finding, type Term } from '@pyreon/ansi'

interface LocatedError {
  message?: unknown
  stack?: unknown
  id?: unknown
  loc?: { file?: unknown; line?: unknown; column?: unknown } | undefined
  frame?: unknown
}

/** The lines `reportFailure` prints; pure for tests. */
export function formatFailure(t: Term, command: string, what: string, error: unknown, fix?: string): string[] {
  const e = (typeof error === 'object' && error !== null ? error : {}) as LocatedError
  const message = typeof e.message === 'string' ? e.message : String(error)
  const file = typeof e.loc?.file === 'string' ? e.loc.file : typeof e.id === 'string' ? e.id : undefined
  const line = typeof e.loc?.line === 'number' ? e.loc.line : undefined
  const column = typeof e.loc?.column === 'number' ? e.loc.column : undefined
  const lines = finding(
    t,
    {
      severity: 'error',
      source: command,
      message: `${what}: ${message.split('\n')[0] ?? ''}`,
      location: file ? { path: file, abs: file.startsWith('/') ? file : undefined, line, column } : undefined,
      fix,
    },
    { indent: 0, width: t.width },
  )
  // Continuation lines of the message and the code frame keep their own
  // indentation (a frame's caret is aligned by it); stack frames are trimmed.
  const detail: string[] = [...message.split('\n').slice(1)]
  if (typeof e.frame === 'string' && e.frame.trim() !== '') detail.push(...e.frame.split('\n'))
  if (typeof e.stack === 'string') {
    // The stack's first line repeats the message; keep only the frames.
    detail.push(...e.stack.split('\n').filter((l) => /^\s+at /.test(l)).map((l) => l.trim()))
  }
  for (const l of detail) lines.push(t.dim(`   ${l}`))
  return lines
}

/** Print a command failure to stderr. */
export function reportFailure(command: string, what: string, error: unknown, fix?: string): void {
  const t = createTerm({ isTTY: Boolean(process.stderr.isTTY) })
  console.error(formatFailure(t, command, what, error, fix).join('\n'))
}
