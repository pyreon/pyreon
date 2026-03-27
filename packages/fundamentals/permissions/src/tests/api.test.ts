import { computed, effect } from "@pyreon/reactivity"
import { describe, expect, it } from "vitest"
import { createPermissions } from "../index"

describe("createPermissions — can.all()", () => {
  it("returns true when all permissions are granted", () => {
    const can = createPermissions({
      "posts.read": true,
      "posts.create": true,
      "posts.update": true,
    })
    expect(can.all("posts.read", "posts.create", "posts.update")).toBe(true)
  })

  it("returns false when any permission is denied", () => {
    const can = createPermissions({
      "posts.read": true,
      "posts.create": true,
      "posts.delete": false,
    })
    expect(can.all("posts.read", "posts.create", "posts.delete")).toBe(false)
  })

  it("returns false when any permission is undefined", () => {
    const can = createPermissions({ "posts.read": true })
    expect(can.all("posts.read", "posts.create")).toBe(false) // posts.create undefined
  })

  it("returns true for empty args (vacuous truth)", () => {
    const can = createPermissions()
    expect(can.all()).toBe(true)
  })

  it("works with wildcards", () => {
    const can = createPermissions({ "posts.*": true })
    expect(can.all("posts.read", "posts.create")).toBe(true)
    expect(can.all("posts.read", "users.manage")).toBe(false)
  })

  it("is reactive in effects", () => {
    const can = createPermissions({
      "posts.read": true,
      "posts.create": true,
    })
    const results: boolean[] = []

    effect(() => {
      results.push(can.all("posts.read", "posts.create"))
    })

    can.patch({ "posts.create": false })
    expect(results).toEqual([true, false])
  })

  it("is reactive in computed", () => {
    const can = createPermissions({
      "posts.read": true,
      "posts.create": true,
    })
    const allGranted = computed(() => can.all("posts.read", "posts.create"))
    expect(allGranted()).toBe(true)

    can.patch({ "posts.create": false })
    expect(allGranted()).toBe(false)
  })
})

describe("createPermissions — can.any()", () => {
  it("returns true when at least one permission is granted", () => {
    const can = createPermissions({
      "posts.read": false,
      "posts.create": true,
    })
    expect(can.any("posts.read", "posts.create")).toBe(true)
  })

  it("returns false when no permissions are granted", () => {
    const can = createPermissions({
      "posts.read": false,
      "posts.create": false,
    })
    expect(can.any("posts.read", "posts.create")).toBe(false)
  })

  it("returns true when all are granted", () => {
    const can = createPermissions({
      "posts.read": true,
      "posts.create": true,
    })
    expect(can.any("posts.read", "posts.create")).toBe(true)
  })

  it("returns false for empty args", () => {
    const can = createPermissions({ "posts.read": true })
    expect(can.any()).toBe(false)
  })

  it("works with undefined permissions", () => {
    const can = createPermissions({ "posts.read": true })
    expect(can.any("posts.read", "nonexistent")).toBe(true)
    expect(can.any("nonexistent", "also-nonexistent")).toBe(false)
  })

  it("works with wildcards", () => {
    const can = createPermissions({ "posts.*": true })
    expect(can.any("posts.read", "users.manage")).toBe(true)
    expect(can.any("users.read", "users.manage")).toBe(false)
  })

  it("is reactive in effects", () => {
    const can = createPermissions({
      "posts.read": false,
      "posts.create": true,
    })
    const results: boolean[] = []

    effect(() => {
      results.push(can.any("posts.read", "posts.create"))
    })

    can.patch({ "posts.create": false })
    expect(results).toEqual([true, false])
  })
})

describe("createPermissions — can.not()", () => {
  it("returns inverse of can()", () => {
    const can = createPermissions({
      "posts.read": true,
      "posts.delete": false,
    })
    expect(can.not("posts.read")).toBe(false)
    expect(can.not("posts.delete")).toBe(true)
  })

  it("returns true for undefined permissions", () => {
    const can = createPermissions()
    expect(can.not("anything")).toBe(true)
  })

  it("works with context for predicate permissions", () => {
    const can = createPermissions({
      "posts.update": (post: any) => post?.authorId === "me",
    })
    expect(can.not("posts.update", { authorId: "me" })).toBe(false)
    expect(can.not("posts.update", { authorId: "other" })).toBe(true)
  })

  it("is reactive", () => {
    const can = createPermissions({ "posts.read": true })
    const results: boolean[] = []

    effect(() => {
      results.push(can.not("posts.read"))
    })

    can.set({ "posts.read": false })
    expect(results).toEqual([false, true])
  })
})

describe("createPermissions — can.set()", () => {
  it("replaces all permissions entirely", () => {
    const can = createPermissions({
      "posts.read": true,
      "users.manage": true,
    })

    can.set({ "posts.read": false })
    expect(can("posts.read")).toBe(false)
    expect(can("users.manage")).toBe(false) // was not in new set
  })

  it("triggers reactive updates", () => {
    const can = createPermissions({ "posts.read": true })
    const results: boolean[] = []

    effect(() => {
      results.push(can("posts.read"))
    })

    can.set({ "posts.read": false })
    can.set({ "posts.read": true })
    expect(results).toEqual([true, false, true])
  })

  it("set with empty object removes all permissions", () => {
    const can = createPermissions({ "posts.read": true, "users.manage": true })
    can.set({})
    expect(can("posts.read")).toBe(false)
    expect(can("users.manage")).toBe(false)
  })

  it("set with predicates", () => {
    const can = createPermissions({})
    can.set({
      "posts.update": (post: any) => post?.authorId === "me",
    })
    expect(can("posts.update", { authorId: "me" })).toBe(true)
    expect(can("posts.update", { authorId: "other" })).toBe(false)
  })
})

describe("createPermissions — can.patch()", () => {
  it("merges with existing permissions", () => {
    const can = createPermissions({
      "posts.read": true,
      "users.manage": false,
    })

    can.patch({ "users.manage": true, "billing.view": true })
    expect(can("posts.read")).toBe(true) // unchanged
    expect(can("users.manage")).toBe(true) // updated
    expect(can("billing.view")).toBe(true) // added
  })

  it("overwrites existing keys", () => {
    const can = createPermissions({ "posts.read": true })
    can.patch({ "posts.read": false })
    expect(can("posts.read")).toBe(false)
  })

  it("adds new keys without removing existing", () => {
    const can = createPermissions({ a: true })
    can.patch({ b: true })
    expect(can("a")).toBe(true)
    expect(can("b")).toBe(true)
  })

  it("triggers reactive updates", () => {
    const can = createPermissions({ "posts.read": false })
    const results: boolean[] = []

    effect(() => {
      results.push(can("posts.read"))
    })

    can.patch({ "posts.read": true })
    expect(results).toEqual([false, true])
  })

  it("patch with predicates", () => {
    const can = createPermissions({ "posts.read": true })
    can.patch({
      "posts.update": (post: any) => post?.draft === true,
    })
    expect(can("posts.read")).toBe(true)
    expect(can("posts.update", { draft: true })).toBe(true)
    expect(can("posts.update", { draft: false })).toBe(false)
  })
})

describe("createPermissions — can.granted()", () => {
  it("returns keys with true values", () => {
    const can = createPermissions({
      "posts.read": true,
      "posts.delete": false,
      "users.manage": true,
    })
    const granted = can.granted()
    expect(granted).toContain("posts.read")
    expect(granted).toContain("users.manage")
    expect(granted).not.toContain("posts.delete")
  })

  it("includes predicate keys (capabilities exist)", () => {
    const can = createPermissions({
      "posts.update": (post: any) => post?.authorId === "me",
    })
    expect(can.granted()).toContain("posts.update")
  })

  it("returns empty array for no permissions", () => {
    const can = createPermissions()
    expect(can.granted()).toEqual([])
  })

  it("returns empty array when all denied", () => {
    const can = createPermissions({ a: false, b: false })
    expect(can.granted()).toEqual([])
  })

  it("is reactive — updates on set()", () => {
    const can = createPermissions({ "posts.read": true })
    const results: string[][] = []

    effect(() => {
      results.push([...can.granted()])
    })

    can.set({ "posts.read": true, "users.manage": true })
    expect(results).toHaveLength(2)
    expect(results[1]).toEqual(expect.arrayContaining(["posts.read", "users.manage"]))
  })

  it("is reactive — updates on patch()", () => {
    const can = createPermissions({ "posts.read": true })
    const results: string[][] = []

    effect(() => {
      results.push([...can.granted()])
    })

    can.patch({ "users.manage": true })
    expect(results).toEqual([["posts.read"], ["posts.read", "users.manage"]])
  })
})

describe("createPermissions — can.entries()", () => {
  it("returns all entries as [key, value] pairs", () => {
    const can = createPermissions({
      "posts.read": true,
      "posts.delete": false,
    })
    const entries = can.entries()
    expect(entries).toHaveLength(2)
    expect(entries).toEqual(
      expect.arrayContaining([
        ["posts.read", true],
        ["posts.delete", false],
      ]),
    )
  })

  it("returns empty array for no permissions", () => {
    const can = createPermissions()
    expect(can.entries()).toEqual([])
  })

  it("includes predicate entries", () => {
    const pred = (post: any) => post?.authorId === "me"
    const can = createPermissions({
      "posts.update": pred,
    })
    const entries = can.entries()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.[0]).toBe("posts.update")
    expect(entries[0]?.[1]).toBe(pred)
  })

  it("is reactive — updates on mutations", () => {
    const can = createPermissions({ a: true })
    const counts: number[] = []

    effect(() => {
      counts.push(can.entries().length)
    })

    can.patch({ b: true })
    can.patch({ c: false })
    expect(counts).toEqual([1, 2, 3])
  })

  it("reflects set() replacement", () => {
    const can = createPermissions({ a: true, b: true, c: true })
    expect(can.entries()).toHaveLength(3)

    can.set({ x: true })
    expect(can.entries()).toHaveLength(1)
    expect(can.entries()[0]?.[0]).toBe("x")
  })
})
