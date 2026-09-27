/**
 * `@pyreon/validate`'s `s` DSL (a wrapper-LESS Standard Schema — `s.object({
 * … })` with no surrounding `zodSchema(...)` call) could not lower a nested
 * `s.object()` field, an `s.array(s.object(…))` element, or an
 * `s.discriminatedUnion()` at all.
 *
 * `parseNestedObjectShape` synthesizes a wrapper `CallExpression` so the same
 * walker that handles `zodSchema(z.object({...}))` can re-parse the nested
 * shape — but it always built `<schemaFn>(objectCallNode)`, even when
 * `schemaFn` is `null` for the wrapper-less `s` DSL, producing
 * `<null>(objectCallNode)` (an Identifier callee named `null`, not the
 * `<prefix>.object` MemberExpression the wrapper-less re-entry branch
 * requires). The nested field — and then the whole schema — was silently
 * dropped, with a warning reading `null declaration` and citing `z.array()`
 * for a form that never mentioned zod. Zod/valibot/arktype (which always use
 * a real wrapper function) were unaffected.
 */
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('the s DSL lowers a NESTED s.object() field', () => {
  const src = `import { s } from '@pyreon/validate'
export const userSchema = s.object({
  name: s.string(),
  address: s.object({
    street: s.string(),
    zip: s.number(),
  }),
})`

  it('Swift: the nested field is NOT dropped, and no warning mentions z.array', () => {
    const { code, warnings } = transform(src, { target: 'swift' })
    expect(code).toContain('var address:')
    expect(code).toContain('street')
    expect(warnings.join('\n')).not.toMatch(/null declaration|z\.array/)
  })

  it('Kotlin: the nested field is NOT dropped', () => {
    const { code } = transform(src, { target: 'kotlin' })
    expect(code).toContain('address')
    expect(code).toContain('street')
  })
})

describe('the s DSL lowers s.array(s.object(...))', () => {
  const src = `import { s } from '@pyreon/validate'
export const ordersSchema = s.object({
  items: s.array(s.object({
    sku: s.string(),
    qty: s.number(),
  })),
})`

  it('Swift: the array-of-object field is NOT dropped', () => {
    // A weak `toContain('items')` passes even on the BROKEN verbatim
    // passthrough (the un-lowered source text still contains the field
    // names) — assert the real struct declaration + parse() call, and the
    // ABSENCE of the "null declaration" warning the broken path emits.
    const { code, warnings } = transform(src, { target: 'swift' })
    expect(code).toContain('struct PyreonZodSchema_ordersSchema')
    expect(code).toMatch(/var items: \[.*\]/)
    expect(warnings.join('\n')).not.toMatch(/null declaration/)
  })
})

/**
 * A field PMTC genuinely cannot lower must still produce a READABLE warning.
 *
 * The wrapper-less `s` DSL has no wrapper function, so `schemaFn` is `null`,
 * and every drop warning interpolated it verbatim: `null declaration \`Pet\``.
 * The array drop also named `z.array()` for code that never mentioned zod.
 * Lathe prints these warnings to every user of a generated multiplatform
 * client, so the text is product surface.
 */
describe('a dropped field in the s DSL names the s DSL', () => {
  const src = `import { s } from '@pyreon/validate'
export const Category = s.object({ id: s.number() })
export const Pet = s.object({
  name: s.string(),
  category: Category,
  tags: s.array(Category),
})`

  it('never says `null declaration`, and never cites zod', () => {
    const { warnings } = transform(src, { target: 'swift' })
    const text = warnings.join('\n')
    expect(text).toContain('s declaration `Pet`')
    expect(text).toContain('`tags` is s.array() with an unsupported inner type')
    expect(text).not.toContain('null declaration')
    expect(text).not.toMatch(/z\.array/)
  })
})
