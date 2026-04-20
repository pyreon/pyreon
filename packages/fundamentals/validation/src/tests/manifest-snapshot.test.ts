import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — validation snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/validation — Schema adapters for Pyreon forms — Zod, Valibot, ArkType. All three schema libraries are optional peer dependencies. Install only the one you use — the adapters are tree-shaken per import path (\`@pyreon/validation/zod\`, \`@pyreon/validation/valibot\`, \`@pyreon/validation/arktype\`)."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/validation — Schema Validation Adapters

      Validation adapters that bridge schema libraries (Zod, Valibot, ArkType) with \`@pyreon/form\`. Each adapter provides a \`*Schema()\` function for whole-form validation and a \`*Field()\` function for single-field validation. Duck-typed so version mismatches are handled gracefully. All three schema libraries are optional peer dependencies — install only the one you use.

      \`\`\`typescript
      import { useForm } from '@pyreon/form'
      import { zodSchema, zodField } from '@pyreon/validation'
      import { z } from 'zod'

      // Whole-form validation via zodSchema
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      })

      const form = useForm({
        initialValues: { email: '', age: 0 },
        schema: zodSchema(schema),        // validates all fields at once
        onSubmit: (values) => save(values),
      })

      // Per-field validation via zodField — use when fields have independent rules
      const form2 = useForm({
        initialValues: { username: '', bio: '' },
        validators: {
          username: zodField(z.string().min(3).max(20)),
          bio: zodField(z.string().max(500)),
        },
        onSubmit: (values) => save(values),
      })

      // Valibot adapter — standalone-function style
      import { valibotSchema, valibotField } from '@pyreon/validation'
      import * as v from 'valibot'

      const vSchema = v.object({ email: v.pipe(v.string(), v.email()) })
      const form3 = useForm({
        initialValues: { email: '' },
        schema: valibotSchema(vSchema, v.safeParse),  // pass safeParse explicitly
        onSubmit: (values) => save(values),
      })

      // ArkType adapter — sync validation only
      import { arktypeSchema } from '@pyreon/validation'
      import { type } from 'arktype'

      const atSchema = type({ email: 'email', age: 'number > 18' })
      const form4 = useForm({
        initialValues: { email: '', age: 0 },
        schema: arktypeSchema(atSchema),
        onSubmit: (values) => save(values),
      })
      \`\`\`

      > **Note**: All three schema libraries are optional peer dependencies. Install only the one you use — the adapters are tree-shaken per import path (\`@pyreon/validation/zod\`, \`@pyreon/validation/valibot\`, \`@pyreon/validation/arktype\`).
      >
      > **Valibot standalone functions**: Valibot uses standalone functions (not methods), so \`valibotSchema\` and \`valibotField\` require passing \`v.safeParse\` as an explicit argument. This is by design to avoid internal coupling to Valibot's module structure.
      >
      > **Duck typing**: The Zod adapter is duck-typed against \`.safeParse()\` — it works with both Zod v3 and v4 without version detection. If a future Zod version changes the safeParse return shape, the adapter will need updating.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(6)
  })
})
