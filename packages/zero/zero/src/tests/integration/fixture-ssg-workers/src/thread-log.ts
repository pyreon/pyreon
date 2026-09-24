// Records which thread rendered each path, through a side channel (a file
// named by an env var) so the rendered HTML stays identical across builds.
// `import.meta.env.SSR` folds to false in the client build, so the node
// imports never reach the browser bundle.
export async function recordThread(path: string): Promise<void> {
  if (!import.meta.env.SSR) return
  const log = process.env.PYREON_SSG_THREAD_LOG
  if (!log) return
  const { threadId } = await import('node:worker_threads')
  const { appendFileSync } = await import('node:fs')
  appendFileSync(log, `${path} ${threadId}\n`)
}
