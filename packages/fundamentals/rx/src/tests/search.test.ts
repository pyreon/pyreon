import { signal } from "@pyreon/reactivity"
import { describe, expect, it } from "vitest"
import { search } from "../search"

type User = { id: number; name: string; email: string }

const users: User[] = [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@test.com" },
  { id: 3, name: "Charlie", email: "charlie@example.com" },
  { id: 4, name: "Diana", email: "diana@test.com" },
]

describe("search — plain values", () => {
  it("returns all items when query is empty", () => {
    const result = search(users, "", ["name"])
    expect(result).toHaveLength(4)
  })

  it("filters by single key", () => {
    const result = search(users, "alice", ["name"])
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe("Alice")
  })

  it("filters across multiple keys", () => {
    const result = search(users, "example", ["name", "email"])
    expect(result).toHaveLength(2)
    expect(result.map((u) => u.name)).toEqual(["Alice", "Charlie"])
  })

  it("is case-insensitive", () => {
    const result = search(users, "BOB", ["name"])
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe("Bob")
  })

  it("trims whitespace from query", () => {
    const result = search(users, "  alice  ", ["name"])
    expect(result).toHaveLength(1)
  })

  it("returns empty array when no matches", () => {
    const result = search(users, "zzz", ["name", "email"])
    expect(result).toHaveLength(0)
  })

  it("only matches string values (skips non-string fields)", () => {
    // id is a number — should not be matched
    const result = search(users, "1", ["id" as keyof User, "name"])
    expect(result).toHaveLength(0)
  })
})

describe("search — signal source (reactive)", () => {
  it("returns computed when source is a signal", () => {
    const src = signal(users)
    const result = search(src, "alice", ["name"])
    expect(typeof result).toBe("function")
    expect(result()).toHaveLength(1)
  })

  it("reacts to source changes", () => {
    const src = signal(users)
    const result = search(src, "test", ["email"])
    expect(result()).toHaveLength(2) // bob + diana

    src.set([...users, { id: 5, name: "Eve", email: "eve@test.com" }])
    expect(result()).toHaveLength(3)
  })

  it("returns computed when query is a signal", () => {
    const query = signal("")
    const result = search(users, query, ["name"])

    expect(typeof result).toBe("function")
    expect(result()).toHaveLength(4) // empty query returns all

    query.set("ali")
    expect(result()).toHaveLength(1)

    query.set("a") // Alice, Charlie, Diana
    expect(result()).toHaveLength(3)
  })

  it("reacts to both source and query signal changes", () => {
    const src = signal(users)
    const query = signal("")
    const result = search(src, query, ["name"])

    expect(result()).toHaveLength(4)

    query.set("bob")
    expect(result()).toHaveLength(1)

    // Remove Bob from source
    src.set(users.filter((u) => u.name !== "Bob"))
    expect(result()).toHaveLength(0)

    query.set("")
    expect(result()).toHaveLength(3) // all remaining users
  })

  it("returns empty when signal query matches nothing", () => {
    const query = signal("nonexistent")
    const result = search(users, query, ["name", "email"])
    expect(result()).toHaveLength(0)
  })
})
