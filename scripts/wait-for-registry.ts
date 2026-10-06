export interface RegistryVisibility {
  pending: string[]
  timedOut: boolean
}

// The existing existence sweep measured resets with 65 simultaneous requests.
export const REGISTRY_LOOKUP_CONCURRENCY = 8

/** Bound npm's visibility delay after an accepted publication. No republishing. */
export async function waitForRegistryVisibility(
  packages: readonly string[],
  isVisible: (pkg: string, signal: AbortSignal) => Promise<boolean>,
  options: {
    timeoutMs?: number
    intervalMs?: number
    onPending?: (packages: readonly string[]) => void
  } = {},
): Promise<RegistryVisibility> {
  const timeoutMs = options.timeoutMs ?? 300_000
  const intervalMs = options.intervalMs ?? 10_000
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0
  ) {
    throw new Error('registry visibility budgets must be positive finite milliseconds')
  }
  let pending = [...new Set(packages)]
  if (pending.length === 0) return { pending, timedOut: false }
  const controller = new AbortController()
  const { signal } = controller
  let deadline: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<RegistryVisibility>((resolve) => {
    deadline = setTimeout(() => {
      controller.abort()
      resolve({ pending: [...pending], timedOut: true })
    }, timeoutMs)
  })
  const pause = () =>
    new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', finish)
        resolve()
      }
      const timer = setTimeout(finish, intervalMs)
      signal.addEventListener('abort', finish, { once: true })
      if (signal.aborted) finish()
    })
  const poll = async (): Promise<RegistryVisibility> => {
    while (!signal.aborted) {
      const scan = [...pending]
      for (let i = 0; i < scan.length && !signal.aborted; i += REGISTRY_LOOKUP_CONCURRENCY) {
        const observed = await Promise.all(
          scan.slice(i, i + REGISTRY_LOOKUP_CONCURRENCY).map(async (pkg) => ({
            pkg,
            visible: await isVisible(pkg, signal),
          })),
        )
        if (signal.aborted) break
        const ready = new Set(observed.filter(({ visible }) => visible).map(({ pkg }) => pkg))
        pending = pending.filter((pkg) => !ready.has(pkg))
      }
      if (signal.aborted) break
      if (pending.length === 0) return { pending, timedOut: false }
      options.onPending?.(pending)
      await pause()
    }
    return { pending, timedOut: true }
  }
  try {
    // The backstop settles even if a lookup ignores its abort signal.
    return await Promise.race([poll(), expired])
  } finally {
    clearTimeout(deadline)
    controller.abort()
  }
}
