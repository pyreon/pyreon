import { describe, expect, it } from 'vitest'
import { groupOf } from '../rules/groups'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * The `js` group — deliberately NOT a general JS/TS lint tier.
 *
 * oxlint owns general JavaScript correctness in this repo, and duplicating it
 * would mean two tools disagreeing about the same line. A rule earns a place
 * here only when it needs context oxlint structurally cannot reach:
 * `no-require-in-esm` reads the owning package's `type` field, which is a
 * project fact rather than an AST one, and `require-error-cause` needs the
 * catch-binding in scope at the throw.
 *
 * `require-error-cause` sat at 57% branches with no dedicated specs.
 */

const cfg = {
  rules: { 'pyreon/require-error-cause': 'warn', 'pyreon/no-require-in-esm': 'error' },
} as never

const at = (src: string, file = 'src/a.ts') =>
  lintFile(file, src, allRules, cfg).diagnostics
const only = (src: string, id: string, file?: string) =>
  at(src, file).filter((d) => d.ruleId === id)

describe('js group wiring', () => {
  it('holds only the three context-requiring rules — not a general JS tier', () => {
    const js = allRules.filter((r) => groupOf(r.meta) === 'js')
    expect(js.map((r) => r.meta.id).sort()).toEqual([
      'pyreon/no-catch-without-rethrow-or-report',
      'pyreon/no-require-in-esm',
      'pyreon/require-error-cause',
    ])
  })
})

describe('pyreon/require-error-cause', () => {
  const ID = 'pyreon/require-error-cause'

  it('fires when a catch re-throws without carrying the original', () => {
    const d = only(
      `export function f() { try { g() } catch (err) { throw new Error('failed') } }`,
      ID,
    )
    expect(d).toHaveLength(1)
  })

  it('stays silent when { cause } is passed — the fix', () => {
    expect(
      only(
        `export function f() { try { g() } catch (err) { throw new Error('failed', { cause: err }) } }`,
        ID,
      ),
    ).toEqual([])
  })

  it('stays silent when the caught error is passed positionally', () => {
    // `new AggregateError([err], 'msg')` and similar already carry it.
    expect(
      only(
        `export function f() { try { g() } catch (err) { throw new AggregateError([err], 'failed') } }`,
        ID,
      ),
    ).toEqual([])
  })

  it('stays silent when the original is interpolated into the message', () => {
    // Interpolating preserves the information, even though it does not
    // preserve the stack — the rule treats a stated intent as a decision
    // rather than insisting on one spelling.
    expect(
      only(
        'export function f() { try { g() } catch (err) { throw new Error(`failed: ${err}`) } }',
        ID,
      ),
    ).toEqual([])
  })

  it('still fires when the template interpolates something ELSE', () => {
    expect(
      only(
        'export function f() { try { g() } catch (err) { throw new Error(`failed: ${ctx}`) } }',
        ID,
      ),
    ).toHaveLength(1)
  })

  it('stays silent on a bare re-throw, which loses nothing', () => {
    expect(only(`export function f() { try { g() } catch (err) { throw err } }`, ID)).toEqual([])
  })

  it('stays silent outside any catch', () => {
    expect(only(`export function f() { throw new Error('plain') }`, ID)).toEqual([])
  })

  it('stays silent when the catch binds nothing', () => {
    // `catch {}` has no error to attach — there is no fix to recommend.
    expect(only(`export function f() { try { g() } catch { throw new Error('x') } }`, ID)).toEqual(
      [],
    )
  })

  it('does not fire for a non-builtin error class', () => {
    // A custom error may take cause in its own way; the rule refuses to guess
    // at a constructor signature it cannot see.
    expect(
      only(`export function f() { try { g() } catch (err) { throw new AppError('x') } }`, ID),
    ).toEqual([])
  })

  it.each(['TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'EvalError'])(
    'covers the %s builtin',
    (ctor) => {
      expect(
        only(`export function f() { try { g() } catch (e) { throw new ${ctor}('x') } }`, ID),
      ).toHaveLength(1)
    },
  )

  it('uses the INNERMOST catch binding when they nest', () => {
    expect(
      only(
        `export function f() { try { a() } catch (outer) { try { b() } catch (inner) { throw new Error('x', { cause: inner }) } } }`,
        ID,
      ),
    ).toEqual([])
  })
})
