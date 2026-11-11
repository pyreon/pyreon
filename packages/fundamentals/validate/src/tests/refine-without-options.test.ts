/**
 * `.refine(fn)` without its options (#4361). `parse()` never throws: a failed
 * refine must come back as an issue. Without `opts` the sync path read
 * `opts.message` off `undefined` and THREW (`parseAsync` caught the same
 * failure and returned `ok: false`, so the two paths disagreed). `opts` is
 * now optional and normalised once, in `.refine()`, with the same default
 * message as `s.custom()`: 'Invalid value'.
 *
 * Bisect-verified: without the normalisation the sync specs throw
 * "undefined is not an object (evaluating 'opts.message')" / "Cannot read
 * properties of undefined (reading 'message')".
 */
import { configure, s } from '../index'

describe('.refine() without options', () => {
  afterEach(() => configure({ jit: true }))

  for (const jit of [true, false]) {
    describe(jit ? 'JIT' : 'interpreter', () => {
      beforeEach(() => configure({ jit }))

      test('a failing refine is an issue on parse, safeParse-style', () => {
        const schema = s.string().refine((x) => x !== 'no')
        const bad = schema.parse('no')
        expect(bad.ok).toBe(false)
        expect(!bad.ok && bad.issues[0]?.message).toBe('Invalid value')
        expect(schema.parse('yes')).toEqual({ ok: true, value: 'yes' })
      })

      test('options without a message also default it; other options are kept', () => {
        const r = s.number().refine((n) => n > 0, { code: 'too_small', key: 'n.pos' }).parse(-1)
        expect(!r.ok && r.issues[0]).toMatchObject({ message: 'Invalid value', code: 'too_small', key: 'n.pos' })
      })

      test('nested in an object, the issue carries the path', () => {
        const r = s.object({ name: s.string().refine((x) => x.length > 2) }).parse({ name: 'ab' })
        expect(!r.ok && r.issues[0]).toMatchObject({ message: 'Invalid value', path: ['name'] })
      })

      test('parse and parseAsync agree', async () => {
        const schema = s.string().refine((x) => x !== 'no')
        const sync = schema.parse('no')
        const async_ = await schema.parseAsync('no')
        expect(async_).toEqual(sync)
      })

      test('an async refine without options fails as an issue under parseAsync', async () => {
        const r = await s.string().refine(async (x) => x !== 'no').parseAsync('no')
        expect(!r.ok && r.issues[0]?.message).toBe('Invalid value')
      })
    })
  }
})
