/**
 * Lower-level browser tests for Nova's mount(), reactivity, and rendering primitives.
 * Uses the playground's Vite dev server which exposes Nova on window.__nova.
 */

import { test, expect } from "@playwright/test"

// Navigate and wait for Nova to be available on window
async function setupNovaPage(page: import("@playwright/test").Page) {
  await page.goto("/")
  await page.waitForSelector("#layout", { timeout: 10_000 })
  // Verify Nova is exposed
  const hasNova = await page.evaluate(() => !!(window as any).__nova)
  expect(hasNova).toBe(true)
}

test.describe("mount - low level", () => {
  test("mount a simple element and verify DOM output", async ({ page }) => {
    await setupNovaPage(page)

    await page.evaluate(() => {
      const { h, mount } = (window as any).__nova
      const app = document.getElementById("app")!
      app.innerHTML = ""
      mount(h("div", { id: "simple" }, "Hello Nova"), app)
    })

    const el = page.locator("#simple")
    await expect(el).toHaveText("Hello Nova")
    await expect(el).toBeVisible()
  })

  test("mount with reactive signal, update signal, verify DOM updates", async ({ page }) => {
    await setupNovaPage(page)

    await page.evaluate(() => {
      const { h, mount, signal } = (window as any).__nova
      const count = signal(0)
      ;(window as any).__count = count

      const app = document.getElementById("app")!
      app.innerHTML = ""
      mount(
        h("div", { id: "reactive-test" },
          h("span", { id: "count-display" }, () => `Count: ${count()}`),
        ),
        app,
      )
    })

    await expect(page.locator("#count-display")).toHaveText("Count: 0")

    await page.evaluate(() => {
      ;(window as any).__count.set(42)
    })
    await expect(page.locator("#count-display")).toHaveText("Count: 42")

    await page.evaluate(() => {
      ;(window as any).__count.update((n: number) => n + 8)
    })
    await expect(page.locator("#count-display")).toHaveText("Count: 50")
  })

  test("mount a list with reactive for-loop rendering", async ({ page }) => {
    await setupNovaPage(page)

    await page.evaluate(() => {
      const { h, mount, signal } = (window as any).__nova
      const items = signal(["Apple", "Banana", "Cherry"])
      ;(window as any).__items = items

      const app = document.getElementById("app")!
      app.innerHTML = ""
      mount(
        h("ul", { id: "fruit-list" },
          () => items().map((item: string) =>
            h("li", { class: "fruit-item" }, item),
          ),
        ),
        app,
      )
    })

    const listItems = page.locator("#fruit-list .fruit-item")
    await expect(listItems).toHaveCount(3)
    await expect(listItems.nth(0)).toHaveText("Apple")
    await expect(listItems.nth(1)).toHaveText("Banana")
    await expect(listItems.nth(2)).toHaveText("Cherry")

    // Add an item
    await page.evaluate(() => {
      ;(window as any).__items.update((list: string[]) => [...list, "Date"])
    })
    await expect(listItems).toHaveCount(4)
    await expect(listItems.nth(3)).toHaveText("Date")

    // Remove an item
    await page.evaluate(() => {
      ;(window as any).__items.update((list: string[]) => list.filter((x: string) => x !== "Banana"))
    })
    await expect(listItems).toHaveCount(3)
    await expect(listItems.nth(0)).toHaveText("Apple")
    await expect(listItems.nth(1)).toHaveText("Cherry")
    await expect(listItems.nth(2)).toHaveText("Date")
  })

  test("conditional rendering with Show component", async ({ page }) => {
    await setupNovaPage(page)

    await page.evaluate(() => {
      const { h, mount, signal, Show } = (window as any).__nova
      const visible = signal(false)
      ;(window as any).__visible = visible

      const app = document.getElementById("app")!
      app.innerHTML = ""
      mount(
        h("div", { id: "show-test" },
          h(Show, {
            when: () => visible(),
            children: h("p", { id: "show-content" }, "Now you see me"),
            fallback: h("p", { id: "show-fallback" }, "Nothing here"),
          }),
        ),
        app,
      )
    })

    // Initially hidden
    await expect(page.locator("#show-fallback")).toBeVisible()
    await expect(page.locator("#show-content")).not.toBeVisible()

    // Toggle visible
    await page.evaluate(() => {
      ;(window as any).__visible.set(true)
    })
    await expect(page.locator("#show-content")).toBeVisible()
    await expect(page.locator("#show-content")).toHaveText("Now you see me")

    // Toggle back
    await page.evaluate(() => {
      ;(window as any).__visible.set(false)
    })
    await expect(page.locator("#show-fallback")).toBeVisible()
    await expect(page.locator("#show-content")).not.toBeVisible()
  })

  test("mount a component function with props", async ({ page }) => {
    await setupNovaPage(page)

    await page.evaluate(() => {
      const { h, mount } = (window as any).__nova

      const Greeting = (props: { name: string; greeting?: string }) =>
        h("p", { id: "greeting" }, `${props.greeting ?? "Hello"}, ${props.name}!`)

      const app = document.getElementById("app")!
      app.innerHTML = ""
      mount(h(Greeting, { name: "Nova", greeting: "Welcome" }), app)
    })

    await expect(page.locator("#greeting")).toHaveText("Welcome, Nova!")
  })

  test("nested components with reactive updates", async ({ page }) => {
    await setupNovaPage(page)

    await page.evaluate(() => {
      const { h, mount, signal, computed } = (window as any).__nova

      const price = signal(10)
      const quantity = signal(2)
      ;(window as any).__price = price
      ;(window as any).__quantity = quantity

      const Total = (props: { price: () => number; quantity: () => number }) => {
        const total = computed(() => props.price() * props.quantity())
        return h("div", { id: "total" },
          h("span", { id: "total-value" }, () => `Total: $${total()}`),
        )
      }

      const app = document.getElementById("app")!
      app.innerHTML = ""
      mount(
        h("div", { id: "shop" },
          h("span", { id: "price-display" }, () => `Price: $${price()}`),
          h("span", { id: "qty-display" }, () => `Qty: ${quantity()}`),
          h(Total, {
            price: () => price(),
            quantity: () => quantity(),
          }),
        ),
        app,
      )
    })

    await expect(page.locator("#price-display")).toHaveText("Price: $10")
    await expect(page.locator("#qty-display")).toHaveText("Qty: 2")
    await expect(page.locator("#total-value")).toHaveText("Total: $20")

    // Update price
    await page.evaluate(() => {
      ;(window as any).__price.set(25)
    })
    await expect(page.locator("#price-display")).toHaveText("Price: $25")
    await expect(page.locator("#total-value")).toHaveText("Total: $50")

    // Update quantity
    await page.evaluate(() => {
      ;(window as any).__quantity.set(4)
    })
    await expect(page.locator("#qty-display")).toHaveText("Qty: 4")
    await expect(page.locator("#total-value")).toHaveText("Total: $100")
  })

  test("unmount cleans up DOM", async ({ page }) => {
    await setupNovaPage(page)

    const result = await page.evaluate(() => {
      const { h, mount } = (window as any).__nova

      const app = document.getElementById("app")!
      app.innerHTML = ""
      const unmount = mount(h("div", { id: "ephemeral" }, "Gone soon"), app)

      const existsBefore = document.getElementById("ephemeral") !== null
      unmount()
      const existsAfter = document.getElementById("ephemeral") !== null

      return { existsBefore, existsAfter }
    })

    expect(result.existsBefore).toBe(true)
    expect(result.existsAfter).toBe(false)
  })

  test("batch coalesces multiple signal updates", async ({ page }) => {
    await setupNovaPage(page)

    const renderCount = await page.evaluate(() => {
      const { h, mount, signal, batch } = (window as any).__nova

      const a = signal(1)
      const b = signal(2)
      let renders = 0

      const app = document.getElementById("app")!
      app.innerHTML = ""
      mount(
        h("span", { id: "batch-sum" }, () => {
          renders++
          return `${a() + b()}`
        }),
        app,
      )

      const beforeBatch = renders

      batch(() => {
        a.set(10)
        b.set(20)
      })

      return { beforeBatch, afterBatch: renders }
    })

    // Batch should cause exactly 1 extra render, not 2
    expect(renderCount.afterBatch - renderCount.beforeBatch).toBe(1)
    await expect(page.locator("#batch-sum")).toHaveText("30")
  })
})
