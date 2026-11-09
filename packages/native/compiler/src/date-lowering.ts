/**
 * JavaScript `Date` on native.
 *
 * Natively a date IS its epoch milliseconds — a Double, NaN when invalid — the representation `Date.now()` and the
 * `Intl` formatters already use. So the whole surface reduces at parse time to numbers and calls into the runtimes'
 * `PyreonDate` functions (`PyreonDate.swift` / `PyreonDate.kt`):
 *
 * - `new Date()` → `Date.now()`; `new Date(x)` → `pyreonDateFrom(x)` (milliseconds, or an ECMAScript date string);
 *   `new Date(y, m, d, h, mi, s, ms)` → `pyreonDateMake(false, …)` (local, rolling over like the web);
 *   `Date.parse(s)` → `pyreonDateFrom(s)`; `Date.UTC(…)` → `pyreonDateMake(true, …)`.
 * - `d.getFullYear()` … `d.getMilliseconds()` (and `getUTC…`) → `pyreonDateGet(d, field, utc)`; `d.getTime()` → `d`;
 *   `d.getTimezoneOffset()` → `pyreonDateTimezoneOffset(d)`; `d.toISOString()` → `pyreonDateISO(d)`.
 * - The type `Date` is a fractional `number` (see `parseTypeAnnotation`).
 *
 * These method names exist on no other JavaScript type, so the rewrite needs no receiver type (`toJSON` does, so it
 * is left alone). The setters
 * (`setHours`, …) mutate the object in place — a date is a value natively — and stay named by the platform-globals
 * survival check.
 */
import type { ExprIR } from './types'

type AnyNode = Record<string, unknown> & { type?: string }

/** `getX` → [field, utc] (the field numbering of `pyreonDateGet`). */
const DATE_GETTERS: Readonly<Record<string, readonly [number, boolean]>> = {
  getFullYear: [0, false],
  getMonth: [1, false],
  getDate: [2, false],
  getDay: [3, false],
  getHours: [4, false],
  getMinutes: [5, false],
  getSeconds: [6, false],
  getMilliseconds: [7, false],
  getUTCFullYear: [0, true],
  getUTCMonth: [1, true],
  getUTCDate: [2, true],
  getUTCDay: [3, true],
  getUTCHours: [4, true],
  getUTCMinutes: [5, true],
  getUTCSeconds: [6, true],
  getUTCMilliseconds: [7, true],
}

const call = (name: string, args: ExprIR[]): ExprIR => ({ kind: 'call', callee: { kind: 'identifier', name }, args })
const num = (n: number): ExprIR => ({ kind: 'literal', value: n })
const bool = (b: boolean): ExprIR => ({ kind: 'literal', value: b })

/** The runtime functions these lower to, with their result type (`'number'` is a fractional number). */
export const DATE_RUNTIME_RESULTS: Readonly<Record<string, 'number' | 'string'>> = {
  pyreonDateFrom: 'number',
  pyreonDateMake: 'number',
  pyreonDateGet: 'number',
  pyreonDateTimezoneOffset: 'number',
  pyreonDateISO: 'string',
}

/**
 * The lowering of a `new Date(…)`, a `Date.parse` / `Date.UTC` call, or a Date-method call — or `undefined` when
 * `node` is none of them. `dateIsShadowed` says whether the file binds its own `Date`.
 */
export function lowerDateNode(
  node: AnyNode,
  parse: (n: AnyNode) => ExprIR,
  dateIsShadowed: boolean,
): ExprIR | undefined {
  const args = (node.arguments as AnyNode[] | undefined) ?? []
  if (node.type === 'NewExpression') {
    if (dateIsShadowed || (node.callee as AnyNode | undefined)?.type !== 'Identifier') return undefined
    if ((node.callee as AnyNode).name !== 'Date') return undefined
    if (args.length === 0) {
      return { kind: 'call', callee: { kind: 'member', object: { kind: 'identifier', name: 'Date' }, property: 'now' }, args: [] }
    }
    if (args.length === 1) return call('pyreonDateFrom', [parse(args[0]!)])
    if (args.length <= 7) return call('pyreonDateMake', [bool(false), ...args.map(parse)])
    return undefined
  }
  if (node.type !== 'CallExpression') return undefined
  const callee = node.callee as AnyNode | undefined
  if (callee?.type !== 'MemberExpression' || callee.computed === true) return undefined
  const prop = (callee.property as AnyNode | undefined)?.name as string | undefined
  if (prop === undefined) return undefined
  const object = callee.object as AnyNode
  // Statics: `Date.parse(text)` / `Date.UTC(y, m, …)`.
  if (object.type === 'Identifier' && object.name === 'Date' && !dateIsShadowed) {
    if (prop === 'parse' && args.length === 1) return call('pyreonDateFrom', [parse(args[0]!)])
    if (prop === 'UTC' && args.length >= 1 && args.length <= 7) return call('pyreonDateMake', [bool(true), ...args.map(parse)])
    return undefined
  }
  // With the file's own `Date`, its methods are its own too.
  if (dateIsShadowed || args.length !== 0 || callee.optional === true) return undefined
  // An own-property read: `DATE_GETTERS['toLocaleString']` would otherwise find Object.prototype's.
  const getter = Object.hasOwn(DATE_GETTERS, prop) ? DATE_GETTERS[prop] : undefined
  if (getter !== undefined) return call('pyreonDateGet', [parse(object), num(getter[0]), bool(getter[1])])
  if (prop === 'getTime') return call('pyreonDateFrom', [parse(object)])
  if (prop === 'getTimezoneOffset') return call('pyreonDateTimezoneOffset', [parse(object)])
  // `toJSON` is not here: other objects define it (a flow's `toJSON()` snapshot), and the name alone cannot tell.
  if (prop === 'toISOString') return call('pyreonDateISO', [parse(object)])
  return undefined
}
