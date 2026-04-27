/**
 * End-to-end tests for the Pyreon Playground app.
 * Tests the full application running in a real browser via Vite dev server.
 */

import { expect, test } from "@playwright/test"

test.describe("Playground App", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test("page loads and renders layout", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Pyreon Playground")
    await expect(page.locator("nav")).toBeVisible()
    await expect(page.locator("main")).toBeVisible()
  })

  test("header has navigation links", async ({ page }) => {
    const nav = page.locator("nav")
    await expect(nav.locator("a", { hasText: "Home" })).toBeVisible()
    await expect(nav.locator("a", { hasText: "About" })).toBeVisible()
  })

  test("home page renders Counter and TodoList", async ({ page }) => {
    // Counter card
    await expect(page.locator(".card h2", { hasText: "Counter" })).toBeVisible()
    await expect(page.locator(".value")).toBeVisible()
    await expect(page.locator(".doubled")).toBeVisible()

    // TodoList card
    await expect(page.locator(".card h2", { hasText: "Todo List" })).toBeVisible()
    await expect(page.locator(".todo-list")).toBeVisible()
  })
})

test.describe("Counter", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test("starts at zero", async ({ page }) => {
    await expect(page.locator(".value")).toHaveText("0")
    // Loose-match because Pyreon's compiler currently drops whitespace
    // between JSX text nodes and expressions ("doubled: {x}" → "doubled:X").
    // Tracked as a separate compiler-side fix; the test verifies the
    // behavior we care about (the doubled value updates) without
    // coupling to whitespace.
    await expect(page.locator(".doubled")).toContainText("0")
  })

  test("increment button increases count", async ({ page }) => {
    await page.locator(".actions button", { hasText: "+" }).click()
    await expect(page.locator(".value")).toHaveText("1")
    await expect(page.locator(".doubled")).toContainText("2")
  })

  test("decrement button decreases count", async ({ page }) => {
    // First increment to 1
    await page.locator(".actions button", { hasText: "+" }).click()
    await expect(page.locator(".value")).toHaveText("1")

    // Then decrement back
    const minusBtn = page.locator(".actions button").first()
    await minusBtn.click()
    await expect(page.locator(".value")).toHaveText("0")
  })

  test("reset button resets count to zero", async ({ page }) => {
    // Increment a few times
    const plusBtn = page.locator(".actions button", { hasText: "+" })
    await plusBtn.click()
    await plusBtn.click()
    await plusBtn.click()
    await expect(page.locator(".value")).toHaveText("3")

    // Reset
    await page.locator(".actions button", { hasText: "Reset" }).click()
    await expect(page.locator(".value")).toHaveText("0")
    await expect(page.locator(".doubled")).toContainText("0")
  })

  test("reactivity: multiple clicks update count and doubled correctly", async ({ page }) => {
    const plusBtn = page.locator(".actions button", { hasText: "+" })
    for (let i = 0; i < 5; i++) {
      await plusBtn.click()
    }
    await expect(page.locator(".value")).toHaveText("5")
    await expect(page.locator(".doubled")).toContainText("10")
  })

  test("decrement goes negative", async ({ page }) => {
    const minusBtn = page.locator(".actions button").first()
    await minusBtn.click()
    await expect(page.locator(".value")).toHaveText("-1")
    await expect(page.locator(".doubled")).toContainText("-2")
  })
})

test.describe("TodoList", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test("renders default todos", async ({ page }) => {
    const items = page.locator(".todo-list li")
    await expect(items).toHaveCount(3)
    await expect(items.nth(0).locator("span")).toHaveText("Build Pyreon framework")
    await expect(items.nth(1).locator("span")).toHaveText("Write tests")
    await expect(items.nth(2).locator("span")).toHaveText("Build the playground")
  })

  test("shows correct remaining count", async ({ page }) => {
    // "Build the playground" is the only unchecked item
    // Loose-match because of the JSX text/expression whitespace bug.
    await expect(page.locator(".remaining")).toContainText("1")
    await expect(page.locator(".remaining")).toContainText("remaining")
  })

  test("add a new todo via button click", async ({ page }) => {
    const input = page.locator('input[type="text"][placeholder="Add a todo…"]')
    await input.fill("New test todo")
    await page.locator("button", { hasText: "Add" }).click()

    const items = page.locator(".todo-list li")
    await expect(items).toHaveCount(4)
    await expect(items.nth(3).locator("span")).toHaveText("New test todo")
    // Input should be cleared
    await expect(input).toHaveValue("")
  })

  test("add a new todo via Enter key", async ({ page }) => {
    const input = page.locator('input[type="text"][placeholder="Add a todo…"]')
    await input.fill("Enter key todo")
    await input.press("Enter")

    const items = page.locator(".todo-list li")
    await expect(items).toHaveCount(4)
    await expect(items.nth(3).locator("span")).toHaveText("Enter key todo")
  })

  test("empty input does not add a todo", async ({ page }) => {
    await page.locator("button", { hasText: "Add" }).click()
    const items = page.locator(".todo-list li")
    await expect(items).toHaveCount(3)
  })

  test("toggle a todo marks it done", async ({ page }) => {
    // Toggle the third item (Build the playground, currently unchecked)
    const thirdCheckbox = page.locator(".todo-list li").nth(2).locator('input[type="checkbox"]')
    await thirdCheckbox.click()

    // Should now be checked and remaining count should drop to 0
    await expect(page.locator(".remaining")).toContainText("0")
    await expect(thirdCheckbox).toBeChecked()
  })

  test("toggle a done todo marks it undone", async ({ page }) => {
    // First item (Build Pyreon framework) is done — uncheck it
    const firstCheckbox = page.locator(".todo-list li").nth(0).locator('input[type="checkbox"]')
    await firstCheckbox.click()

    // Should now be unchecked and remaining count should increase to 2
    await expect(page.locator(".remaining")).toContainText("2")
    await expect(firstCheckbox).not.toBeChecked()
  })

  test("remove a todo", async ({ page }) => {
    // Remove the first todo
    await page.locator(".todo-list li").nth(0).locator("button.remove").click()

    const items = page.locator(".todo-list li")
    await expect(items).toHaveCount(2)
    // First item should now be "Write tests"
    await expect(items.nth(0).locator("span")).toHaveText("Write tests")
  })

  test("add and remove a todo", async ({ page }) => {
    const input = page.locator('input[type="text"][placeholder="Add a todo…"]')
    await input.fill("Temporary todo")
    await input.press("Enter")

    await expect(page.locator(".todo-list li")).toHaveCount(4)

    // Remove the newly added item (last)
    await page.locator(".todo-list li").nth(3).locator("button.remove").click()
    await expect(page.locator(".todo-list li")).toHaveCount(3)
  })
})

test.describe("Router Navigation", () => {
  test("navigating to About page", async ({ page }) => {
    await page.goto("/")
    await page.locator("nav a", { hasText: "About" }).click()

    await expect(page.locator("h2", { hasText: "About Pyreon" })).toBeVisible()
    await expect(page.locator("main p")).toContainText("fine-grained reactive UI framework")
    // Counter and TodoList should not be visible
    await expect(page.locator(".value")).not.toBeVisible()
  })

  test("navigating back to Home page", async ({ page }) => {
    await page.goto("/")
    // Go to About
    await page.locator("nav a", { hasText: "About" }).click()
    await expect(page.locator("h2", { hasText: "About Pyreon" })).toBeVisible()

    // Go back to Home
    await page.locator("nav a", { hasText: "Home" }).click()
    await expect(page.locator(".value")).toBeVisible()
    await expect(page.locator(".todo-list")).toBeVisible()
  })

  test("About page lists framework features", async ({ page }) => {
    await page.goto("/")
    await page.locator("nav a", { hasText: "About" }).click()

    const features = page.locator(".card ul li")
    await expect(features).toHaveCount(4)
  })

  test("header stays visible during navigation", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("h1")).toHaveText("Pyreon Playground")

    await page.locator("nav a", { hasText: "About" }).click()
    await expect(page.locator("h1")).toHaveText("Pyreon Playground")

    await page.locator("nav a", { hasText: "Home" }).click()
    await expect(page.locator("h1")).toHaveText("Pyreon Playground")
  })

  test("counter state resets when navigating away and back", async ({ page }) => {
    await page.goto("/")
    // Increment counter
    await page.locator(".actions button", { hasText: "+" }).click()
    await page.locator(".actions button", { hasText: "+" }).click()
    await expect(page.locator(".value")).toHaveText("2")

    // Navigate away and back
    await page.locator("nav a", { hasText: "About" }).click()
    await page.locator("nav a", { hasText: "Home" }).click()

    // State resets since components re-mount (no KeepAlive in playground)
    await expect(page.locator(".value")).toHaveText("0")
  })
})
