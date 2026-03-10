/**
 * Browser tests for Pyreon's SSR hydration.
 * Pre-renders HTML on the server side, then hydrates in the browser.
 */

import { test, expect } from "./fixtures"

test.describe("hydration", () => {
  test("hydrates static HTML and preserves DOM", async ({ page }) => {
    // Navigate to hydration page with pre-rendered HTML
    const ssrHtml = '<div id="greeting"><span>Hello</span><span> World</span></div>'
    await page.goto(`/hydration?html=${encodeURIComponent(ssrHtml)}`)
    await page.waitForFunction(() => (window as any).__PYREON__ !== undefined)

    // Hydrate the pre-rendered HTML
    const nodeCount = await page.evaluate(() => {
      const { h, hydrateRoot } = (window as any).__PYREON__
      const app = document.getElementById("app")!
      const childCountBefore = app.childNodes.length

      hydrateRoot(
        app,
        h("div", { id: "greeting" },
          h("span", null, "Hello"),
          h("span", null, " World"),
        ),
      )

      // DOM should be reused, not recreated
      return { before: childCountBefore, after: app.childNodes.length }
    })

    await expect(page.locator("#greeting")).toHaveText("Hello World")
    // Child count should remain the same (DOM reused)
    expect(nodeCount.before).toBe(nodeCount.after)
  })

  test("hydrated event handlers work", async ({ page }) => {
    const ssrHtml = '<button id="btn">Count: 0</button>'
    await page.goto(`/hydration?html=${encodeURIComponent(ssrHtml)}`)
    await page.waitForFunction(() => (window as any).__PYREON__ !== undefined)

    await page.evaluate(() => {
      const { h, hydrateRoot, signal } = (window as any).__PYREON__
      const count = signal(0)
      const app = document.getElementById("app")!

      hydrateRoot(
        app,
        h("button", {
          id: "btn",
          onClick: () => count.set(count() + 1),
        }, () => `Count: ${count()}`),
      )
    })

    const btn = page.locator("#btn")
    await expect(btn).toHaveText("Count: 0")

    await btn.click()
    await expect(btn).toHaveText("Count: 1")

    await btn.click()
    await expect(btn).toHaveText("Count: 2")
  })

  test("hydrates component with reactive state", async ({ page }) => {
    const ssrHtml = '<div id="app-root"><p>Hello, Pyreon!</p></div>'
    await page.goto(`/hydration?html=${encodeURIComponent(ssrHtml)}`)
    await page.waitForFunction(() => (window as any).__PYREON__ !== undefined)

    await page.evaluate(() => {
      const { h, hydrateRoot, signal } = (window as any).__PYREON__
      const name = signal("Pyreon")
      ;(window as any).__name = name

      const Greeting = () => h("div", { id: "app-root" }, h("p", null, () => `Hello, ${name()}!`))
      const app = document.getElementById("app")!
      hydrateRoot(app, h(Greeting, null))
    })

    await expect(page.locator("#app-root p")).toHaveText("Hello, Pyreon!")

    await page.evaluate(() => {
      ;(window as any).__name.set("World")
    })

    await expect(page.locator("#app-root p")).toHaveText("Hello, World!")
  })
})
