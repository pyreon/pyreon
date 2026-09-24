/**
 * The client emitter, and the native-reach verdict.
 *
 * **The emitted client** is where two of lathe's own documented bugs
 * lived: `schema: standardSchema` is REQUIRED because `@pyreon/http`
 * keeps schema support opt-in, so an endpoint declared with a `response`
 * against a client that never enabled it REJECTS A 200 AT RUNTIME — a
 * failure no static check can see. And the baseUrl is emitted as a
 * STRING LITERAL on purpose: PMTC reads it at compile time, so a
 * computed value makes every endpoint on the client web-only, silently.
 *
 * **The verdict** decides whether lathe tells the author their client
 * reaches iOS and Android. Its whole design is that zero warnings is NOT
 * evidence — a standalone hook wrapping `useQuery` produces none and
 * emits Swift that cannot find the symbol — so the check is a POSITIVE
 * marker, and the expectations are read off the SOURCE so a file that
 * never asked for a query is not penalised for lacking a query marker.
 *
 * Getting `broken` wrong in the optimistic direction is the expensive
 * one: the author ships believing it lowers and finds out at a build
 * failure with no line number.
 */
import { describe, expect, it } from 'vitest'
import { emitClient } from '../emit/client'
import { worstVerdict } from '../verify/lower'
import type { VerifyReport } from '../verify/lower'
import type { IrDocument, IrOperation } from '../core/ir'

const op = (over: Partial<IrOperation> = {}): IrOperation => ({
  id: 'getUser', tag: 'users', method: 'GET', path: '/users/{id}',
  pathParams: [], queryParams: [],
  ...over,
} as IrOperation)

const doc = (over: Partial<IrDocument> = {}): IrDocument => ({
  title: 'My API', version: '1', baseUrl: 'https://api.example.com',
  models: [], operations: [op()], notes: [], ...over,
} as IrDocument)

const emit = (d = doc(), opts: Record<string, unknown> = {}) =>
  emitClient(d, { native: false, ...opts } as never).build('// generated').contents

describe('the emitted client enables schema support', () => {
  it('passes standardSchema to the client factory', () => {
    // `@pyreon/http` keeps schema support opt-in so the core costs
    // nothing unused. An endpoint declared with a `response` against a
    // client that never enabled it REJECTS A 200 at runtime — the least
    // debuggable shape there is, and invisible to every static check.
    const out = emit()
    expect(out).toContain('standardSchema')
    expect(out).toContain('@pyreon/http/schema')
  })

  it('emits the baseUrl as a STRING LITERAL', () => {
    // PMTC bakes the request URL at compile time. A computed value — an
    // env read, a concatenation — makes every endpoint on this client
    // web-only, and nothing says so.
    const out = emit()
    expect(out).toContain("'https://api.example.com'")
    expect(out, 'no concatenation or env read').not.toMatch(/baseUrl:\s*[^'"\n]*\+/)
    expect(out).not.toContain('process.env')
  })

  it('lets a config baseUrl OVERRIDE the spec server', () => {
    const out = emit(doc(), { baseUrl: 'https://override.example.com' })
    expect(out).toContain('https://override.example.com')
    expect(out).not.toContain('https://api.example.com')
  })

  it('emits the client factory ONLY — endpoints live in their own layer', () => {
    // The layered output is the point: `client.ts` holds one `api`, and
    // the per-tag endpoint files import it. Emitting endpoints here
    // would put the whole surface behind one import and defeat the
    // tree-shaking the layering exists for.
    const out = emit(doc({
      operations: [op(), op({ id: 'createUser', method: 'POST', path: '/users' })],
    }))
    expect(out).toContain('createHttp')
    expect(out).toContain('export const api')
    expect(out, 'endpoints are a different file').not.toContain('getUser')
  })

  it('exposes a dev-transport seam without shipping a dev import', () => {
    // The mock transport is swapped at runtime through a setter rather
    // than imported here — an import would give a bundler an edge to
    // follow and pull fixtures into production.
    const out = emit()
    expect(out).toContain('setDevTransport')
    expect(out).not.toContain('./mocks')
    expect(out).not.toContain('./faker')
  })

  it('is deterministic', () => {
    // `lathe check` fails on output stale against the spec.
    const d = doc({ operations: [op({ id: 'b' }), op({ id: 'a' })] })
    expect(emit(d)).toBe(emit(d))
  })
})

describe('a non-default client switches the whole emitter', () => {
  it('emits a self-contained adapter client for a named HTTP runtime', () => {
    // The adapter path carries its own error type and helpers rather
    // than importing @pyreon/http, so a consumer on plain fetch does not
    // need a package they never installed.
    const out = emit(doc(), { client: 'fetch' })
    expect(out).toContain('LatheHttpError')
    // Assert on the IMPORT, not on the string: the adapter deliberately
    // MENTIONS `@pyreon/http` in comments, documenting which of its
    // types it mirrors exactly. A bare substring check would forbid that.
    expect(out, 'no runtime dependency on a package they never installed')
      .not.toMatch(/^\s*import[^\n]*'@pyreon\/http/m)
  })

  it('defaults to the pyreon client', () => {
    expect(emit(doc(), { client: undefined })).toContain('@pyreon/http')
  })
})

describe('the reach verdict reduces per-file answers conservatively', () => {
  const report = (files: Array<{ verdict: string }>, ran = true): VerifyReport =>
    ({ ran, files } as VerifyReport)

  it('reports lowers only when every file lowers', () => {
    // The control.
    expect(worstVerdict(report([{ verdict: 'lowers' }, { verdict: 'lowers' }]))).toBe('lowers')
  })

  it('lets ONE broken file decide the whole verdict', () => {
    // A native build links all of them; a single unlinkable file fails
    // the build, so an averaged answer would be a lie.
    expect(worstVerdict(report([{ verdict: 'lowers' }, { verdict: 'broken' }]))).toBe('broken')
  })

  it('prefers BROKEN over web-only when both are present', () => {
    // web-only is a limitation the author can plan around; broken is a
    // build that fails. Reporting the milder one buries it.
    expect(worstVerdict(report([{ verdict: 'web-only' }, { verdict: 'broken' }]))).toBe('broken')
  })

  it('reports web-only when that is the worst', () => {
    expect(worstVerdict(report([{ verdict: 'lowers' }, { verdict: 'web-only' }]))).toBe('web-only')
  })

  it('reports SKIPPED when the compiler was absent — never lowers', () => {
    // An absent compiler must skip LOUDLY. Reporting `lowers` for a
    // check that never ran is the exact claim the design forbids: zero
    // warnings is not evidence.
    expect(worstVerdict(report([], false))).toBe('skipped')
    expect(worstVerdict(report([{ verdict: 'lowers' }], false))).toBe('skipped')
  })

  it('reports SKIPPED when it ran over nothing', () => {
    // Zero files is not a pass either — there was nothing to verify.
    expect(worstVerdict(report([], true))).toBe('skipped')
  })
})
