/**
 * `waitFor(callback, options?)` — poll `callback` until it stops throwing (or
 * returns a truthy value), then resolve with its result; reject with the last
 * error on timeout. The async escape hatch for state that settles across
 * microtasks / animation frames after an interaction.
 *
 * Mirrors `@testing-library/dom`'s `waitFor`. Pyreon's reactive updates apply
 * synchronously for direct signal writes but a rendered effect may commit on a
 * later microtask/rAF — `waitFor` bridges that without hard-coded sleeps.
 */
export interface WaitForOptions {
  /** Give up after this many ms (default 1000). */
  timeout?: number
  /** Poll cadence in ms (default 50). */
  interval?: number
}

export async function waitFor<T>(
  callback: () => T | Promise<T>,
  options: WaitForOptions = {},
): Promise<T> {
  const timeout = options.timeout ?? 1000
  const interval = options.interval ?? 50
  const start = performance.now()
  let lastError: unknown

  for (;;) {
    try {
      // TL semantics: resolve on the first call that doesn't THROW. The
      // dominant pattern is assertions-inside-void-return (`expect(...)...`);
      // a returned value (e.g. a found element) is passed through unchanged.
      return await callback()
    } catch (err) {
      lastError = err
    }
    if (performance.now() - start >= timeout) {
      throw lastError instanceof Error
        ? lastError
        : new Error(`waitFor timed out after ${timeout}ms`)
    }
    await new Promise((r) => setTimeout(r, interval))
  }
}
