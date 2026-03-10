/**
 * Browser tests for Pyreon's mount() — verifies real DOM rendering.
 */

import { test, expect } from "./fixtures"

test.describe("mount", () => {
  test("mounts a simple element", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount } = (window as any).__PYREON__
      const app = document.getElementById("app")!
      mount(h("div", { id: "hello" }, "Hello Pyreon"), app)
    })

    const el = page.locator("#hello")
    await expect(el).toHaveText("Hello Pyreon")
  })

  test("mounts nested elements", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount } = (window as any).__PYREON__
      const app = document.getElementById("app")!
      mount(
        h("div", { id: "outer" },
          h("span", { class: "inner" }, "Child 1"),
          h("span", { class: "inner" }, "Child 2"),
        ),
        app,
      )
    })

    await expect(page.locator("#outer")).toBeVisible()
    const spans = page.locator("#outer .inner")
    await expect(spans).toHaveCount(2)
    await expect(spans.nth(0)).toHaveText("Child 1")
    await expect(spans.nth(1)).toHaveText("Child 2")
  })

  test("mounts a component function", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount } = (window as any).__PYREON__
      const Greeting = (props: { name: string }) =>
        h("p", { id: "greeting" }, `Hello, ${props.name}!`)
      const app = document.getElementById("app")!
      mount(h(Greeting, { name: "World" }), app)
    })

    await expect(page.locator("#greeting")).toHaveText("Hello, World!")
  })

  test("mounts a fragment with multiple children", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, Fragment, mount } = (window as any).__PYREON__
      const app = document.getElementById("app")!
      mount(
        h(Fragment, null,
          h("p", { class: "frag" }, "First"),
          h("p", { class: "frag" }, "Second"),
        ),
        app,
      )
    })

    const items = page.locator("#app .frag")
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toHaveText("First")
    await expect(items.nth(1)).toHaveText("Second")
  })

  test("applies attributes and event handlers", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount, signal } = (window as any).__PYREON__
      const count = signal(0)
      const app = document.getElementById("app")!
      mount(
        h("button", {
          id: "btn",
          "data-testid": "counter",
          onClick: () => count.set(count() + 1),
        }, () => `Count: ${count()}`),
        app,
      )
    })

    const btn = page.locator("#btn")
    await expect(btn).toHaveText("Count: 0")
    await expect(btn).toHaveAttribute("data-testid", "counter")

    await btn.click()
    await expect(btn).toHaveText("Count: 1")
  })

  test("unmount removes DOM and cleans up", async ({ pyreonPage: page }) => {
    const textAfterUnmount = await page.evaluate(() => {
      const { h, mount } = (window as any).__PYREON__
      const app = document.getElementById("app")!
      const unmount = mount(h("div", { id: "temp" }, "Temporary"), app)

      // Verify it's mounted
      const before = document.getElementById("temp")?.textContent
      unmount()
      const after = document.getElementById("temp")
      return { before, afterExists: after !== null }
    })

    expect(textAfterUnmount.before).toBe("Temporary")
    expect(textAfterUnmount.afterExists).toBe(false)
  })
})
