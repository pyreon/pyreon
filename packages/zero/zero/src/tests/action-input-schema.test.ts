import type { MiddlewareContext } from '@pyreon/server'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  _defineActionWithId,
  _resetActions,
  type ActionInputError,
  createActionMiddleware,
  defineAction,
  resolveActionOptions,
  type StandardSchemaV1,
} from '../actions'
import { transformServerActions } from '../actions-transform'
import { createFormActionMiddleware } from '../form-actions-server'

// `defineAction(schema, handler)` — Standard Schema input validation before
// the handler runs (Astro actions `input`, TanStack Start `.validator`,
// SvelteKit remote functions). Before it, every handler parsed `ctx.json` /
// `ctx.formData` by hand.

/** A hand-rolled Standard Schema: `{ title: non-empty string, n: numeric string → number }`. */
const postSchema: StandardSchemaV1<{ title: string; n: string }, { title: string; n: number }> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate(value) {
      const v = (value ?? {}) as Record<string, unknown>
      const issues: StandardSchemaV1.Issue[] = []
      if (typeof v.title !== 'string' || v.title === '') issues.push({ message: 'Title is required', path: ['title'] })
      const n = Number(v.n)
      if (!Number.isFinite(n)) issues.push({ message: 'Not a number', path: [{ key: 'n' }] })
      return issues.length ? { issues } : { value: { title: v.title as string, n } }
    },
  },
}

/** arktype's shape: the schema is a FUNCTION carrying `~standard`. */
const fnSchema = Object.assign(() => undefined, {
  '~standard': {
    version: 1 as const,
    vendor: 'fn',
    validate: async (value: unknown) =>
      typeof value === 'string' ? { value: value.toUpperCase() } : { issues: [{ message: 'Expected a string' }] },
  },
})

function jsonCtx(id: string, body: unknown): MiddlewareContext {
  const url = `http://h/_zero/actions/${id}`
  const req = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { req, url: new URL(url), path: '/', locals: {}, headers: new Headers() }
}

afterEach(() => _resetActions())

describe('defineAction(schema, handler)', () => {
  it('passes the parsed OUTPUT to the handler through the JSON endpoint', async () => {
    const handler = vi.fn(async (input: { title: string; n: number }) => ({ saved: input }))
    _defineActionWithId('action_ok', postSchema, handler)
    const res = (await createActionMiddleware()(jsonCtx('action_ok', { title: 'Hi', n: '3' }))) as Response
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ saved: { title: 'Hi', n: 3 } })
    expect(handler.mock.calls[0]![1].request).toBeInstanceOf(Request)
  })

  it('answers 422 with issues + per-field messages and never runs the handler on invalid input', async () => {
    const handler = vi.fn()
    _defineActionWithId('action_bad', postSchema, handler)
    const res = (await createActionMiddleware()(jsonCtx('action_bad', { title: '', n: 'x' }))) as Response
    expect(res.status).toBe(422)
    const body = (await res.json()) as ActionInputError
    expect(body).toEqual({
      error: 'Invalid input',
      issues: [
        { message: 'Title is required', path: 'title' },
        { message: 'Not a number', path: 'n' },
      ],
      fields: { title: ['Title is required'], n: ['Not a number'] },
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('validates a no-JS / enhanced FORM post (fields as an object) and exposes fields to the page', async () => {
    _defineActionWithId('action_form', postSchema, async (input) => input)
    const mw = createFormActionMiddleware({
      routes: [],
      render: async () => new Response('page'),
      options: resolveActionOptions(),
      base: '',
    })
    const post = (fields: Record<string, string>) => {
      const fd = new FormData()
      for (const [k, v] of Object.entries(fields)) fd.append(k, v)
      const url = 'http://h/p?_action=action_form'
      const req = new Request(url, { method: 'POST', headers: { 'X-Zero-Action': '1' }, body: fd })
      return mw({ req, url: new URL(url), path: '/p', locals: {}, headers: new Headers() }) as Promise<Response>
    }
    const bad = await post({ title: '', n: '1' })
    expect(await bad.json()).toMatchObject({
      kind: 'data',
      status: 422,
      data: { fields: { title: ['Title is required'] } },
    })
    const good = await post({ title: 'T', n: '7' })
    expect(await good.json()).toMatchObject({ kind: 'data', status: 200, data: { title: 'T', n: 7 } })
  })

  it('accepts a function-shaped schema (arktype) and an async validate', async () => {
    _defineActionWithId('action_fn', fnSchema, async (input: string) => `got ${input}`)
    const ok = (await createActionMiddleware()(jsonCtx('action_fn', 'abc'))) as Response
    expect(await ok.json()).toBe('got ABC')
    const bad = (await createActionMiddleware()(jsonCtx('action_fn', 1))) as Response
    expect(bad.status).toBe(422)
    expect(((await bad.json()) as ActionInputError).fields).toEqual({ '': ['Expected a string'] })
  })

  it('a repeated form field becomes an array', async () => {
    const seen: unknown[] = []
    const tags: StandardSchemaV1 = {
      '~standard': { version: 1, vendor: 't', validate: (v) => (seen.push(v), { value: v }) },
    }
    _defineActionWithId('action_tags', tags, async () => 'ok')
    const fd = new FormData()
    fd.append('tag', 'a')
    fd.append('tag', 'b')
    fd.append('one', 'x')
    const url = 'http://h/_zero/actions/action_tags'
    const req = new Request(url, { method: 'POST', body: fd })
    await createActionMiddleware()({ req, url: new URL(url), path: '/', locals: {}, headers: new Headers() })
    expect({ ...(seen[0] as object) }).toEqual({ tag: ['a', 'b'], one: 'x' })
  })

  it('a server-side direct call validates too and returns the failure instead of running the handler', async () => {
    const handler = vi.fn(async () => 'ran')
    const action = defineAction(postSchema, handler)
    const out = await action({ title: '', n: '1' })
    expect(out).toMatchObject({ status: 422, data: { fields: { title: ['Title is required'] } } })
    expect(handler).not.toHaveBeenCalled()
    expect(await action({ title: 'ok', n: '1' })).toBe('ran')
  })

  it('types: handler input is the schema OUTPUT, the callable takes the schema INPUT', () => {
    const action = defineAction(postSchema, async (input) => {
      expectTypeOf(input).toEqualTypeOf<{ title: string; n: number }>()
      return input.n
    })
    expectTypeOf(action).parameter(0).toEqualTypeOf<{ title: string; n: string } | undefined>()
  })

  it('throws a [Pyreon] error when the handler is missing or the first argument is neither', () => {
    expect(() => _defineActionWithId('a1', postSchema)).toThrow(/handler is missing/)
    expect(() => _defineActionWithId('a2', {} as never)).toThrow(/must be a handler function or a Standard Schema/)
  })
})

describe('transform — the two-argument form', () => {
  const SRC = `import { defineAction } from '@pyreon/zero/actions'
import { schema } from './schema'
import { db } from './db'
export const save = defineAction(schema, async (input) => db.save(input))
`
  it('SERVER keeps schema + handler after the injected id', () => {
    const out = transformServerActions(SRC, 'a.ts', 'src/a.ts', true)!
    expect(out).toMatch(/_defineActionWithId as \w+/)
    expect(out).toMatch(/\w+\("[^"]+", schema, async \(input\) => db\.save\(input\)\)/)
  })
  it('CLIENT drops both, and the schema + db imports with them', () => {
    const out = transformServerActions(SRC, 'a.ts', 'src/a.ts', false)!
    expect(out).not.toContain('schema')
    expect(out).not.toContain('./db')
  })
})
