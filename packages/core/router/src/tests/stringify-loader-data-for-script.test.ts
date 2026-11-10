/**
 * `stringifyLoaderDataForScript` emits a JavaScript EXPRESSION for an inline
 * `<script>window.X=…</script>`. A JS object literal treats a `"__proto__":`
 * key as a prototype setter, so every such KEY is rewritten to the computed
 * `["__proto__"]`; the evaluated value must equal `JSON.parse` of the JSON
 * twin, and every other byte must be left alone.
 */
import { describe, expect, it } from 'vitest'
import { jsonToScriptExpression, stringifyLoaderData, stringifyLoaderDataForScript } from '../loader'

/** Evaluate the expression the way the inline `<script>` does. */
function evaluate(expr: string): unknown {
  return new Function(`return (${expr})`)()
}

/** Build an object with an OWN `__proto__` key, as `JSON.parse` does. */
function withOwnProto(proto: unknown, rest: Record<string, unknown> = {}): Record<string, unknown> {
  const o: Record<string, unknown> = { ...rest }
  Object.defineProperty(o, '__proto__', { value: proto, enumerable: true, writable: true, configurable: true })
  return o
}

describe('stringifyLoaderDataForScript', () => {
  it('returns output byte-identical to stringifyLoaderData when no __proto__ key exists', () => {
    const data = { '/': { a: 1, s: 'x "__proto__" y', list: ['__proto__', { b: '</script>' }] } }
    expect(stringifyLoaderDataForScript(data)).toBe(stringifyLoaderData(data))
  })

  it('keeps an own __proto__ key as an own key after evaluation, at any depth', () => {
    const data = {
      '/users': {
        byName: withOwnProto({ isAdmin: true }, { alice: { isAdmin: false } }),
        nested: [withOwnProto('plain-string')],
      },
    }
    const json = stringifyLoaderData(data)
    const expr = stringifyLoaderDataForScript(data)
    expect(expr).toContain('["__proto__"]:')
    // The bare JSON text, evaluated as a literal, loses the key (the bug).
    const viaJsonText = evaluate(json) as { '/users': { byName: Record<string, unknown> } }
    expect(Object.hasOwn(viaJsonText['/users'].byName, '__proto__')).toBe(false)
    // The script expression keeps it and matches JSON.parse exactly.
    const value = evaluate(expr) as { '/users': { byName: Record<string, unknown> } }
    expect(value).toEqual(JSON.parse(json))
    const byName = value['/users'].byName
    expect(Object.hasOwn(byName, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(byName)).toBe(Object.prototype)
    expect((byName as { bob?: { isAdmin?: boolean } }).bob).toBeUndefined()
    expect((byName as { isAdmin?: unknown }).isAdmin).toBeUndefined()
  })

  it('rewrites only KEY tokens: string values and string contents stay untouched', () => {
    const data = {
      v: '__proto__',
      inner: 'he said "__proto__": hi \\"__proto__\\":',
      arr: ['__proto__', '"__proto__":'],
      own: withOwnProto(1),
    }
    const expr = stringifyLoaderDataForScript(data)
    expect(expr.match(/\["__proto__"\]/g)).toHaveLength(1)
    expect(evaluate(expr)).toEqual(JSON.parse(stringifyLoaderData(data)))
  })

  it('leaves a key that merely starts with __proto__ alone', () => {
    const data = { __proto__x: 1, own: withOwnProto(2) }
    const expr = stringifyLoaderDataForScript(data)
    expect(expr).toContain('"__proto__x":1')
    expect(expr).toContain('["__proto__"]:2')
  })
})

describe('jsonToScriptExpression — adversarial input', () => {
  it('stays linear on an unterminated run of escaped quotes (no polynomial backtracking)', () => {
    // A string-token regex retried from every `"` is quadratic here: ~10 s
    // at this size for the pre-fix `/"(?:[^"\\]|\\.)*"/g`, ~1 ms for the scan.
    const input = `{"__proto__":"${'\\"'.repeat(40_000)}`
    const t0 = performance.now()
    const out = jsonToScriptExpression(input)
    const elapsed = performance.now() - t0
    expect(out.startsWith('{["__proto__"]:"')).toBe(true)
    expect(out.length).toBe(input.length + 2)
    expect(elapsed).toBeLessThan(1000)
  })

  it('handles a trailing lone backslash and an unterminated token without overrunning', () => {
    expect(jsonToScriptExpression('{"__proto__":"a\\')).toBe('{["__proto__"]:"a\\')
    expect(jsonToScriptExpression('{"__proto__":1,"__proto__')).toBe('{["__proto__"]:1,"__proto__')
  })
})

describe('stringifyLoaderData — cycle check edge arms', () => {
  it('names the key path where the cycle closes, through objects and arrays', () => {
    // A function sibling is skipped by the walk exactly as JSON.stringify drops it.
    const data: Record<string, unknown> = { render: () => 'x' }
    data.self = data
    expect(() => stringifyLoaderData(data)).toThrow('circular reference at "self"')
    const arr: unknown[] = []
    arr.push(arr)
    expect(() => stringifyLoaderData({ list: arr })).toThrow('circular reference at "list[0]"')
  })

  it('follows toJSON exactly as JSON.stringify does: a Date and a toJSON to a primitive are not cycles', () => {
    const at = new Date(0)
    const tagged = { toJSON: () => 'tag' }
    const data = { a: at, b: at, c: tagged }
    expect(JSON.parse(stringifyLoaderData(data))).toEqual({ a: at.toJSON(), b: at.toJSON(), c: 'tag' })
  })

  it('detects a cycle reached THROUGH a toJSON result', () => {
    const inner: Record<string, unknown> = {}
    inner.back = inner
    expect(() => stringifyLoaderData({ wrapped: { toJSON: () => inner } })).toThrow(
      'circular reference at "wrapped.back"',
    )
  })

  it('ignores a cycle reachable only through a function or symbol value (never serialized)', () => {
    const data: Record<string, unknown> = { keep: 1 }
    const fn = Object.assign(() => data, { data })
    data.fn = fn
    data.sym = Symbol('s')
    expect(JSON.parse(stringifyLoaderData(data))).toEqual({ keep: 1 })
  })
})
