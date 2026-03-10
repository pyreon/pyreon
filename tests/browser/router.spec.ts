/**
 * Browser tests for Pyreon's router — hash mode navigation in the browser.
 */

import { test, expect } from "./fixtures"

test.describe("router", () => {
  test("renders the initial route", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount, createRouter, RouterProvider, RouterView } = (window as any).__PYREON__

      const Home = () => h("div", { id: "home" }, "Home Page")
      const About = () => h("div", { id: "about" }, "About Page")

      const router = createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/about", component: About },
        ],
        mode: "hash",
      })

      const app = document.getElementById("app")!
      mount(
        h(RouterProvider, { router }, h(RouterView, null)),
        app,
      )
    })

    await expect(page.locator("#home")).toBeVisible()
    await expect(page.locator("#home")).toHaveText("Home Page")
  })

  test("navigates between routes with router.push()", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount, createRouter, RouterProvider, RouterView } = (window as any).__PYREON__

      const Home = () => h("div", { id: "home" }, "Home Page")
      const About = () => h("div", { id: "about" }, "About Page")

      const router = createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/about", component: About },
        ],
        mode: "hash",
      })

      ;(window as any).__router = router

      const app = document.getElementById("app")!
      mount(
        h(RouterProvider, { router }, h(RouterView, null)),
        app,
      )
    })

    await expect(page.locator("#home")).toBeVisible()

    await page.evaluate(() => {
      ;(window as any).__router.push("/about")
    })

    await expect(page.locator("#about")).toBeVisible()
    await expect(page.locator("#about")).toHaveText("About Page")
  })

  test("RouterLink navigates on click", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount, createRouter, RouterProvider, RouterView, RouterLink } = (window as any).__PYREON__

      const Home = () => h("div", { id: "home" }, "Home Page")
      const About = () => h("div", { id: "about" }, "About Page")

      const router = createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/about", component: About },
        ],
        mode: "hash",
      })

      const app = document.getElementById("app")!
      mount(
        h(RouterProvider, { router },
          h("nav", null,
            h(RouterLink, { to: "/" }, "Home"),
            h(RouterLink, { to: "/about" }, "About"),
          ),
          h(RouterView, null),
        ),
        app,
      )
    })

    await expect(page.locator("#home")).toBeVisible()

    // RouterLink doesn't forward extra props to <a>, so select by text
    await page.locator("a", { hasText: "About" }).click()
    await expect(page.locator("#about")).toBeVisible()

    await page.locator("a", { hasText: "Home" }).click()
    await expect(page.locator("#home")).toBeVisible()
  })

  test("route params are accessible in components", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount, createRouter, RouterProvider, RouterView, useRoute } = (window as any).__PYREON__

      const UserPage = () => {
        const route = useRoute()
        return h("div", { id: "user" }, () => `User: ${route().params.id}`)
      }

      const router = createRouter({
        routes: [
          { path: "/", component: () => h("div", { id: "home" }, "Home") },
          { path: "/user/:id", component: UserPage },
        ],
        mode: "hash",
      })

      ;(window as any).__router = router

      const app = document.getElementById("app")!
      mount(
        h(RouterProvider, { router }, h(RouterView, null)),
        app,
      )
    })

    await page.evaluate(() => {
      ;(window as any).__router.push("/user/42")
    })

    await expect(page.locator("#user")).toHaveText("User: 42")

    await page.evaluate(() => {
      ;(window as any).__router.push("/user/99")
    })

    await expect(page.locator("#user")).toHaveText("User: 99")
  })

  test("hash changes in URL update the router", async ({ pyreonPage: page }) => {
    await page.evaluate(() => {
      const { h, mount, createRouter, RouterProvider, RouterView } = (window as any).__PYREON__

      const Home = () => h("div", { id: "home" }, "Home Page")
      const About = () => h("div", { id: "about" }, "About Page")

      const router = createRouter({
        routes: [
          { path: "/", component: Home },
          { path: "/about", component: About },
        ],
        mode: "hash",
      })

      const app = document.getElementById("app")!
      mount(
        h(RouterProvider, { router }, h(RouterView, null)),
        app,
      )
    })

    await expect(page.locator("#home")).toBeVisible()

    // Directly change the hash — router should pick it up
    await page.evaluate(() => {
      window.location.hash = "#/about"
    })

    await expect(page.locator("#about")).toBeVisible()
  })
})
