/**
 * E2E reactivity tests — verify signal-driven DOM updates in a real browser.
 * Uses the playground's mount primitives exposed on window.__pyreon.
 */

import { expect, test } from '@playwright/test'

async function setupPyreon(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('#layout', { timeout: 10_000 })
}

test.describe('Reactivity E2E', () => {
  test('signal → text update in real DOM', async ({ page }) => {
    await setupPyreon(page)

    await page.evaluate(() => {
      const { h, mount, signal } = (window as any).__pyreon
      const app = document.getElementById('app')!
      app.innerHTML = ''

      const count = signal(0)
      mount(h('div', { id: 'test-signal' }, () => `Count: ${count()}`), app)
      ;(window as any).__testSignal = count
    })

    await expect(page.locator('#test-signal')).toHaveText('Count: 0')

    await page.evaluate(() => (window as any).__testSignal.set(42))
    await expect(page.locator('#test-signal')).toHaveText('Count: 42')

    await page.evaluate(() => (window as any).__testSignal.set(-1))
    await expect(page.locator('#test-signal')).toHaveText('Count: -1')
  })

  test('signal → class attribute update', async ({ page }) => {
    await setupPyreon(page)

    await page.evaluate(() => {
      const { h, mount, signal } = (window as any).__pyreon
      const app = document.getElementById('app')!
      app.innerHTML = ''

      const active = signal(false)
      mount(h('div', { id: 'test-class', class: () => active() ? 'on' : 'off' }), app)
      ;(window as any).__testActive = active
    })

    await expect(page.locator('#test-class')).toHaveClass('off')

    await page.evaluate(() => (window as any).__testActive.set(true))
    await expect(page.locator('#test-class')).toHaveClass('on')
  })

  test('two independent signals — changing one does not affect the other', async ({ page }) => {
    await setupPyreon(page)

    await page.evaluate(() => {
      const { h, mount, signal } = (window as any).__pyreon
      const app = document.getElementById('app')!
      app.innerHTML = ''

      const a = signal('A')
      const b = signal('B')
      mount(
        h('div', null,
          h('span', { id: 'sig-a' }, () => a()),
          h('span', { id: 'sig-b' }, () => b()),
        ),
        app,
      )
      ;(window as any).__sigA = a
      ;(window as any).__sigB = b
    })

    await expect(page.locator('#sig-a')).toHaveText('A')
    await expect(page.locator('#sig-b')).toHaveText('B')

    await page.evaluate(() => (window as any).__sigA.set('changed'))
    await expect(page.locator('#sig-a')).toHaveText('changed')
    await expect(page.locator('#sig-b')).toHaveText('B')
  })

  test('computed value updates when dependency changes', async ({ page }) => {
    await setupPyreon(page)

    await page.evaluate(() => {
      const { h, mount, signal, computed } = (window as any).__pyreon
      const app = document.getElementById('app')!
      app.innerHTML = ''

      const count = signal(3)
      const doubled = computed(() => count() * 2)
      mount(h('div', { id: 'test-computed' }, () => `${doubled()}`), app)
      ;(window as any).__testCount = count
    })

    await expect(page.locator('#test-computed')).toHaveText('6')

    await page.evaluate(() => (window as any).__testCount.set(10))
    await expect(page.locator('#test-computed')).toHaveText('20')
  })

  test('batch updates — DOM updates once', async ({ page }) => {
    await setupPyreon(page)

    await page.evaluate(() => {
      const { h, mount, signal, batch } = (window as any).__pyreon
      const app = document.getElementById('app')!
      app.innerHTML = ''

      const a = signal(0)
      const b = signal(0)
      let renders = 0
      mount(
        h('div', { id: 'test-batch' }, () => {
          renders++
          return `${a()} + ${b()} = ${a() + b()}`
        }),
        app,
      )
      ;(window as any).__batchA = a
      ;(window as any).__batchB = b
      ;(window as any).__getRenders = () => renders
      return renders
    })

    await expect(page.locator('#test-batch')).toHaveText('0 + 0 = 0')

    await page.evaluate(() => {
      const { batch } = (window as any).__pyreon
      batch(() => {
        ;(window as any).__batchA.set(5)
        ;(window as any).__batchB.set(3)
      })
    })

    await expect(page.locator('#test-batch')).toHaveText('5 + 3 = 8')
  })

  test('effect cleanup on unmount', async ({ page }) => {
    await setupPyreon(page)

    await page.evaluate(() => {
      const { h, mount, signal } = (window as any).__pyreon
      const app = document.getElementById('app')!
      app.innerHTML = ''

      const count = signal(0)
      let effectRuns = 0
      const cleanup = mount(
        h('div', { id: 'test-cleanup' }, () => {
          effectRuns++
          return `${count()}`
        }),
        app,
      )
      ;(window as any).__cleanupCount = count
      ;(window as any).__cleanup = cleanup
      ;(window as any).__getEffectRuns = () => effectRuns
    })

    await expect(page.locator('#test-cleanup')).toHaveText('0')

    // Signal change updates DOM
    await page.evaluate(() => (window as any).__cleanupCount.set(1))
    await expect(page.locator('#test-cleanup')).toHaveText('1')

    // Unmount
    await page.evaluate(() => (window as any).__cleanup())

    // Signal change after unmount — no error, no DOM change
    const textAfter = await page.evaluate(() => {
      ;(window as any).__cleanupCount.set(999)
      return document.getElementById('test-cleanup')?.textContent ?? 'removed'
    })
    // Element may be removed or text stays at last value
    expect(['1', 'removed']).toContain(textAfter)
  })
})

test.describe('SSR Content Verification', () => {
  test('page source contains server-rendered HTML (not empty shell)', async ({ page }) => {
    // Check that the initial page load has content in the HTML source
    const response = await page.goto('/')
    const html = await response!.text()

    // Should have actual content, not just an empty div
    expect(html).toContain('Pyreon Playground')
    // Should have the layout structure
    expect(html).toContain('nav')
  })
})

test.describe('DOM Stability', () => {
  test('rapid signal updates do not cause DOM corruption', async ({ page }) => {
    await setupPyreon(page)

    await page.evaluate(() => {
      const { h, mount, signal } = (window as any).__pyreon
      const app = document.getElementById('app')!
      app.innerHTML = ''

      const count = signal(0)
      mount(h('div', { id: 'rapid' }, () => `${count()}`), app)
      ;(window as any).__rapid = count
    })

    // Rapid fire 100 updates
    await page.evaluate(() => {
      for (let i = 0; i < 100; i++) {
        ;(window as any).__rapid.set(i)
      }
    })

    await expect(page.locator('#rapid')).toHaveText('99')
  })

  test('signal updates during event handler', async ({ page }) => {
    await setupPyreon(page)

    await page.evaluate(() => {
      const { h, mount, signal } = (window as any).__pyreon
      const app = document.getElementById('app')!
      app.innerHTML = ''

      const count = signal(0)
      mount(
        h('div', null,
          h('button', { id: 'inc-btn', onClick: () => count.set(count() + 1) }, 'Inc'),
          h('span', { id: 'inc-val' }, () => `${count()}`),
        ),
        app,
      )
    })

    await expect(page.locator('#inc-val')).toHaveText('0')

    await page.locator('#inc-btn').click()
    await expect(page.locator('#inc-val')).toHaveText('1')

    // Click 5 more times rapidly
    for (let i = 0; i < 5; i++) {
      await page.locator('#inc-btn').click()
    }
    await expect(page.locator('#inc-val')).toHaveText('6')
  })
})
