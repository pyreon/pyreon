import { vi } from 'vitest'

/**
 * Reports go through `writeOut` (`process.stdout.write`), not `console.log`
 * (#4799: Bun's `console.log` truncates on a full pipe). Tests that capture
 * output by spying `console.log` call this after the spy, so a `writeOut`
 * reaches the same capture, one call per report, without its trailing newline.
 */
export function stdoutToConsoleLog() {
  return vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown, ...rest: unknown[]) => {
    console.log(String(chunk).replace(/\n$/, ''))
    const cb = rest.find((r): r is () => void => typeof r === 'function')
    cb?.()

    return true
  }) as typeof process.stdout.write)
}
