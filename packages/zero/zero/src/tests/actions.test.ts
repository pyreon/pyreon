import { beforeEach, describe, expect, it } from "vitest"
import {
  _resetActions,
  createActionMiddleware,
  defineAction,
  getRegisteredActions,
} from "../actions"

beforeEach(() => {
  _resetActions()
})

describe("defineAction", () => {
  it("registers an action in the registry", () => {
    defineAction(async () => ({ ok: true }))
    expect(getRegisteredActions().size).toBe(1)
  })

  it("assigns unique IDs", () => {
    const a = defineAction(async () => "a")
    const b = defineAction(async () => "b")
    expect(a.actionId).not.toBe(b.actionId)
  })

  it("returns a callable with actionId", () => {
    const action = defineAction(async () => 42)
    expect(typeof action).toBe("function")
    expect(action.actionId).toMatch(/^action_\d+$/)
  })
})

describe("createActionMiddleware", () => {
  it("returns undefined for non-action paths", async () => {
    const mw = createActionMiddleware()
    const ctx = mockCtx("/about", "GET")
    const result = await mw(ctx)
    expect(result).toBeUndefined()
  })

  it("returns 404 for unknown action ID", async () => {
    const mw = createActionMiddleware()
    const ctx = mockCtx("/_zero/actions/unknown", "POST")
    const result = await mw(ctx)
    expect(result).toBeInstanceOf(Response)
    expect(result?.status).toBe(404)
  })

  it("returns 405 for non-POST requests", async () => {
    defineAction(async () => "ok")
    const mw = createActionMiddleware()
    const actionId = getRegisteredActions().keys().next().value
    const ctx = mockCtx(`/_zero/actions/${actionId}`, "GET")
    const result = await mw(ctx)
    expect(result?.status).toBe(405)
  })

  it("executes action and returns JSON result", async () => {
    const action = defineAction(async (ctx) => {
      const data = ctx.json as { x: number }
      return { doubled: data.x * 2 }
    })
    const mw = createActionMiddleware()
    const ctx = mockCtx(`/_zero/actions/${action.actionId}`, "POST", JSON.stringify({ x: 5 }))
    const result = await mw(ctx)
    expect(result?.status).toBe(200)
    const body = await result?.json()
    expect(body).toEqual({ doubled: 10 })
  })

  it("returns 500 on action error", async () => {
    const action = defineAction(async () => {
      throw new Error("boom")
    })
    const mw = createActionMiddleware()
    const ctx = mockCtx(`/_zero/actions/${action.actionId}`, "POST", "null")
    const result = await mw(ctx)
    expect(result?.status).toBe(500)
    const body = await result?.json()
    expect(body.error).toBe("boom")
  })
})

describe("defineAction — server-side execution", () => {
  it("executes handler directly on server (no fetch)", async () => {
    // In test env (Node/Bun), globalThis.window is undefined → server mode
    const action = defineAction(async (ctx) => {
      const data = ctx.json as { x: number }
      return { result: data.x + 1 }
    })

    const result = await action({ x: 10 })
    expect(result).toEqual({ result: 11 })
  })

  it("passes null json when called without data", async () => {
    const action = defineAction(async (ctx) => {
      return { received: ctx.json }
    })

    const result = await action()
    expect(result).toEqual({ received: null })
  })

  it("propagates errors on server-side execution", async () => {
    const action = defineAction(async () => {
      throw new Error("server error")
    })

    await expect(action()).rejects.toThrow("server error")
  })
})

function mockCtx(path: string, method: string, body?: string) {
  const url = new URL(`http://localhost${path}`)
  const req = new Request(url.toString(), {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ?? undefined,
  })
  return {
    req,
    url,
    path,
    headers: new Headers(),
    locals: {},
  }
}
