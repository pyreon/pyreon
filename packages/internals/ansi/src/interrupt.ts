/**
 * Ctrl-C for a long run: print what the run got through, as the last line
 * (`! interrupted · 3 of 13 gates · 2.1 s`), and exit 130 (128 + SIGINT),
 * the shell's convention for a run stopped by the user.
 */

export interface InterruptOptions {
  /** Where the line goes. Default: stderr, so a `--json` stdout stays valid JSON. */
  write?: ((text: string) => void) | undefined
  /** Exit instead of only printing. Default true. */
  exit?: boolean | undefined
  /**
   * Exit code. Default 130 (stopped before it finished). A watch mode,
   * where Ctrl-C is the normal way to end, passes 0.
   */
  code?: number | undefined
}

/**
 * Install a one-shot SIGINT handler that prints `render()` and exits 130.
 * Returns the disposer; call it when the run finishes so a later Ctrl-C
 * falls through to the default behaviour.
 */
export function onInterrupt(render: () => string, opts: InterruptOptions = {}): () => void {
  const write = opts.write ?? ((text: string) => void process.stderr.write(text))
  const handler = (): void => {
    process.off('SIGINT', handler)
    write(`\n${render()}\n`)
    if (opts.exit ?? true) process.exit(opts.code ?? 130)
  }
  process.on('SIGINT', handler)
  return () => {
    process.off('SIGINT', handler)
  }
}
