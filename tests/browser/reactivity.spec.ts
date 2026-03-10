/**
 * Browser tests for Pyreon's reactivity system — signals, computed, effects, batch.
 * Verifies that reactive updates propagate to the real DOM.
 */

import { test, expect } from "./fixtures"

test.describe("reactivity", () => {
  test("signal updates reflect in DOM text", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount, signal } = (window as any).__PYREON__
      const name = signal("Alice")
      ;(window as any).__name = name
      const app = document.getElementById("app")!
      mount(h("span", { id: "name" }, () => name()), app)
    })

    await expect(page.locator("#name")).toHaveText("Alice")

    await page.evaluate(() => {
      ;(window as any).__name.set("Bob")
    })

    await expect(page.locator("#name")).toHaveText("Bob")
  })

  test("computed values update DOM", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount, signal, computed } = (window as any).__PYREON__
      const firstName = signal("John")
      const lastName = signal("Doe")
      const fullName = computed(() => `${firstName()} ${lastName()}`)
      ;(window as any).__firstName = firstName
      ;(window as any).__lastName = lastName
      const app = document.getElementById("app")!
      mount(h("span", { id: "full" }, () => fullName()), app)
    })

    await expect(page.locator("#full")).toHaveText("John Doe")

    await page.evaluate(() => {
      ;(window as any).__firstName.set("Jane")
    })
    await expect(page.locator("#full")).toHaveText("Jane Doe")

    await page.evaluate(() => {
      ;(window as any).__lastName.set("Smith")
    })
    await expect(page.locator("#full")).toHaveText("Jane Smith")
  })

  test("batch coalesces updates into one DOM flush", async ({ pyreonPage: page }) => {
    const result = await page.evaluate(() => {
      const { h, mount, signal, batch } = (window as any).__PYREON__
      const a = signal(1)
      const b = signal(2)
      let renderCount = 0
      const app = document.getElementById("app")!
      mount(
        h("span", { id: "sum" }, () => {
          renderCount++
          return `${a() + b()}`
        }),
        app,
      )
      const countBeforeBatch = renderCount
      batch(() => {
        a.set(10)
        b.set(20)
      })
      // renderCount should have incremented by exactly 1 (not 2)
      return { countBeforeBatch, countAfterBatch: renderCount }
    })

    // After batch, renderCount should increase by exactly 1 (not 2)
    expect(result.countAfterBatch - result.countBeforeBatch).toBe(1)
    await expect(page.locator("#sum")).toHaveText("30")
  })

  test("effect runs when dependencies change", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { signal, effect } = (window as any).__PYREON__
      const count = signal(0)
      const log: number[] = []
      effect(() => {
        log.push(count())
      })
      ;(window as any).__count = count
      ;(window as any).__log = log
    })

    await page.evaluate(() => {
      ;(window as any).__count.set(1)
      ;(window as any).__count.set(2)
    })

    const log = await page.evaluate(() => (window as any).__log)
    // Effect fires on each set: [0, 1, 2]
    expect(log).toEqual([0, 1, 2])
  })

  test("reactive class and style attributes", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount, signal } = (window as any).__PYREON__
      const isActive = signal(false)
      ;(window as any).__isActive = isActive
      const app = document.getElementById("app")!
      mount(
        h("div", {
          id: "styled",
          class: () => isActive() ? "active" : "inactive",
          style: () => isActive() ? "color: green" : "color: red",
        }, "Toggle"),
        app,
      )
    })

    const el = page.locator("#styled")
    await expect(el).toHaveClass("inactive")
    await expect(el).toHaveCSS("color", "rgb(255, 0, 0)")

    await page.evaluate(() => {
      ;(window as any).__isActive.set(true)
    })

    await expect(el).toHaveClass("active")
    await expect(el).toHaveCSS("color", "rgb(0, 128, 0)")
  })

  test("conditional rendering with Show", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount, signal, Show } = (window as any).__PYREON__
      const visible = signal(false)
      ;(window as any).__visible = visible
      const app = document.getElementById("app")!
      mount(
        h("div", { id: "container" },
          h(Show, {
            when: () => visible(),
            children: h("p", { id: "content" }, "Visible!"),
            fallback: h("p", { id: "fallback" }, "Hidden"),
          }),
        ),
        app,
      )
    })

    await expect(page.locator("#fallback")).toBeVisible()
    await expect(page.locator("#content")).not.toBeVisible()

    await page.evaluate(() => {
      ;(window as any).__visible.set(true)
    })

    await expect(page.locator("#content")).toBeVisible()
  })

  test("signal.update() works correctly", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount, signal } = (window as any).__PYREON__
      const count = signal(5)
      ;(window as any).__count = count
      const app = document.getElementById("app")!
      mount(h("span", { id: "val" }, () => `${count()}`), app)
    })

    await expect(page.locator("#val")).toHaveText("5")

    await page.evaluate(() => {
      ;(window as any).__count.update((n: number) => n * 2)
    })

    await expect(page.locator("#val")).toHaveText("10")
  })
})
