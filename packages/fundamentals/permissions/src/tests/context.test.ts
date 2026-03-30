import { describe, expect, it } from "vitest"
import { createPermissions, usePermissions } from "../index"

describe("usePermissions", () => {
  it("throws when called outside PermissionsProvider", () => {
    expect(() => usePermissions()).toThrow(
      "[@pyreon/permissions] usePermissions() must be used within <PermissionsProvider>.",
    )
  })
})

describe("createPermissions used directly (no context)", () => {
  it("works standalone without any provider", () => {
    const can = createPermissions({ "posts.read": true })
    expect(can("posts.read")).toBe(true)
  })

  it("multiple independent instances do not interfere", () => {
    const canA = createPermissions({ "posts.read": true })
    const canB = createPermissions({ "posts.read": false })

    expect(canA("posts.read")).toBe(true)
    expect(canB("posts.read")).toBe(false)

    canA.set({ "posts.read": false })
    expect(canA("posts.read")).toBe(false)
    expect(canB("posts.read")).toBe(false) // unchanged, already false
  })

  it("set() on one instance does not affect another", () => {
    const canA = createPermissions({ a: true, b: true })
    const canB = createPermissions({ a: true, b: true })

    canA.set({ a: false })
    expect(canA("a")).toBe(false)
    expect(canA("b")).toBe(false) // cleared by set

    expect(canB("a")).toBe(true) // unaffected
    expect(canB("b")).toBe(true)
  })

  it("patch() on one instance does not affect another", () => {
    const canA = createPermissions({ shared: true })
    const canB = createPermissions({ shared: true })

    canA.patch({ shared: false })
    expect(canA("shared")).toBe(false)
    expect(canB("shared")).toBe(true) // unaffected
  })
})
