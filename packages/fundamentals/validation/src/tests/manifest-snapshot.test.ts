import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — validation snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/validation — The library-agnostic validation gate — Standard Schema bridge + Zod / Valibot / ArkType adapters. All three schema libraries are optional peer dependencies. Install only the one you use — the adapters are tree-shaken per import path (\`@pyreon/validation/zod\`, \`@pyreon/validation/valibot\`, \`@pyreon/validation/arktype\`)."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/validation — Universal Validation Gate

      The stack-wide validation gate — the library-agnostic contract every Pyreon data package (\`@pyreon/form\`, \`@pyreon/store\`, \`@pyreon/state-tree\`, \`@pyreon/feature\`) consumes. Owns the validation contract types (\`ValidationError\` / \`ValidateFn\` / \`SchemaValidateFn\`) and the Standard Schema bridge, with ZERO pyreon dependencies (the consumers depend on it, not the reverse). Accept a RAW Standard Schema (Zod 3.24+, Valibot 1+, ArkType 2+, Effect Schema, \`@pyreon/validate\` \`s\`) directly — no wrapper, no cast — via \`standardSchemaToValidator\`, or use the duck-typed \`zodSchema\` / \`valibotSchema\` / \`arktypeSchema\` adapters (which add the \`_infer\` brand + a sync \`parse\` for schema-driven state). All schema libraries are optional peer dependencies.

      \`\`\`typescript
      import { useForm } from '@pyreon/form'
      import { z } from 'zod'

      // Universal gate: pass a RAW Standard Schema directly — no adapter, no cast.
      // Zod ≥3.24 / Valibot ≥1 / ArkType ≥2 / Effect Schema / @pyreon/validate 's'
      // all expose '~standard', so the form bridges it via standardSchemaToValidator.
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      })

      const form = useForm({
        initialValues: { email: '', age: 0 },
        schema,                             // raw schema — the gate adapts it
        onSubmit: (values) => save(values),
      })

      // Or use the typed adapter when you want the _infer brand + sync parse
      // (schema-driven @pyreon/store / @pyreon/state-tree need the coerced value):
      import { zodSchema, zodField } from '@pyreon/validation'

      const form2 = useForm({
        initialValues: { username: '', bio: '' },
        validators: {
          username: zodField(z.string().min(3).max(20)),  // per-field
          bio: zodField(z.string().max(500)),
        },
        schema: zodSchema(z.object({ username: z.string(), bio: z.string() })),
        onSubmit: (values) => save(values),
      })

      // Valibot adapter — standalone-function style (pass v.safeParse explicitly)
      import { valibotSchema } from '@pyreon/validation'
      import * as v from 'valibot'

      const vSchema = v.object({ email: v.pipe(v.string(), v.email()) })
      const form3 = useForm({
        initialValues: { email: '' },
        schema: valibotSchema(vSchema, v.safeParse),
        onSubmit: (values) => save(values),
      })

      // Bridge a raw schema by hand when you need the validator standalone:
      import { standardSchemaToValidator } from '@pyreon/validation'
      const validate = standardSchemaToValidator(schema)
      const errors = await validate({ email: 'x', age: 5 })
      // => { email: 'Invalid email', age: 'Too small: ...' }
      \`\`\`

      > **Note**: All three schema libraries are optional peer dependencies. Install only the one you use — the adapters are tree-shaken per import path (\`@pyreon/validation/zod\`, \`@pyreon/validation/valibot\`, \`@pyreon/validation/arktype\`).
      >
      > **Raw Standard Schema needs no wrapper**: Zod 3.24+, Valibot 1+, ArkType 2+, Effect Schema, and \`@pyreon/validate\`'s \`s\` all expose \`~standard\`, so you can pass the schema DIRECTLY (\`useForm({ schema: z.object(...) })\`) — the gate bridges it via \`standardSchemaToValidator\`. Reach for \`zodSchema()\` / \`valibotSchema()\` / \`arktypeSchema()\` when you want the \`_infer\`-branded typed adapter, the sync \`parse\` path (schema-driven \`@pyreon/store\` / \`@pyreon/state-tree\`), or a library that is not Standard-Schema-compliant.
      >
      > **Contract types live here now**: \`ValidationError\` / \`ValidateFn\` / \`SchemaValidateFn\` are OWNED by \`@pyreon/validation\` (the gate has ZERO pyreon deps; \`@pyreon/form\` / \`@pyreon/store\` / \`@pyreon/state-tree\` / \`@pyreon/feature\` depend on it). \`@pyreon/form\` re-exports them, so \`import { ValidationError } from '@pyreon/form'\` still works.
      >
      > **Valibot standalone functions**: Valibot uses standalone functions (not methods), so \`valibotSchema\` and \`valibotField\` require passing \`v.safeParse\` as an explicit argument. This is by design to avoid internal coupling to Valibot's module structure.
      >
      > **Duck typing**: Every adapter AND the Standard Schema bridge duck-type at runtime — they never \`import\` from Zod / Valibot / ArkType. Major version bumps in any validator library do not break the gate.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(20)
  })
})
