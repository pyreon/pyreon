import { chromium, expect, test, type Page } from '@playwright/test'
import { forceGcTwice, HEAP_AUDIT_CHROMIUM_ARGS } from '../scripts/perf/heap'

async function retainedHeap(page: Page): Promise<number> {
  await forceGcTwice(page)
  return page.evaluate(() => {
    const memory = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory
    return memory.usedJSHeapSize
  })
}

test('heap audits detect a retained allocation and its release', async () => {
  const browser = await chromium.launch({ args: HEAP_AUDIT_CHROMIUM_ARGS })
  try {
    const page = await browser.newPage()
    const before = await retainedHeap(page)
    await page.evaluate(() => {
      Reflect.set(window, '__heapControl', Array.from({ length: 200_000 }, (_, i) => ({ value: i, text: `heap-${i}` })))
    })
    const retained = await retainedHeap(page)
    await page.evaluate(() => { Reflect.deleteProperty(window, '__heapControl') })
    const released = await retainedHeap(page)
    expect(retained - before).toBeGreaterThan(4_000_000)
    expect(retained - released).toBeGreaterThan(4_000_000)
  } finally {
    await browser.close()
  }
})

test('heap audits collect detached documents after navigation', async () => {
  const browser = await chromium.launch({ args: HEAP_AUDIT_CHROMIUM_ARGS })
  try {
    const page = await browser.newPage()
    await page.route('https://heap.test/', route => route.fulfill({
      contentType: 'text/html',
      body: '<script>window.__heapControl = Array.from({length: 100000}, (_, i) => ({value: i}));</script>',
    }))
    await page.goto('https://heap.test/')
    const before = await retainedHeap(page)
    for (let i = 0; i < 10; i++) {
      await page.reload()
      await retainedHeap(page)
    }
    expect((await retainedHeap(page)) - before).toBeLessThan(1_000_000)
  } finally {
    await browser.close()
  }
})
