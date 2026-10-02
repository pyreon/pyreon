import type { Page } from 'playwright'

// Use fresh, precise counters for both audit entry points and the browser proof.
export const HEAP_AUDIT_CHROMIUM_ARGS = ['--js-flags=--expose-gc', '--enable-precise-memory-info']

export async function forceGcTwice(page: Page): Promise<void> {
  // Page-level gc() can leave detached navigation contexts alive. Collect
  // through the browser protocol so a reload cannot manufacture heap growth.
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('HeapProfiler.collectGarbage')
    await session.send('HeapProfiler.collectGarbage')
  } finally {
    await session.detach()
  }
}
