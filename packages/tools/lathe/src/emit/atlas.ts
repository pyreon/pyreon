/**
 * Atlas scenario emission.
 *
 * `@pyreon/atlas` derives a component catalog from source, and scenarios are
 * the axis it cannot infer: it can see that a component takes props, not what
 * a REALISTIC value for those props looks like. A spec knows — it carries
 * examples, enums and required/optional shape.
 *
 * So the generated data components arrive in the workbench already populated
 * with plausible data, and every enum field expands into one scenario per
 * value rather than one arbitrary sample. That is the bit worth automating:
 * hand-written scenarios drift from the schema the moment the API changes,
 * and these regenerate with it.
 */

import type { IrDocument, IrField, IrOperation, IrType } from '../core/ir'
import { typeIdent } from '../core/naming'
import { byTag, isMutation } from './client'
import { jsonLiteral, q, SourceFile } from './writer'

export const ATLAS_FILE = 'atlas.scenarios.ts'

/**
 * Emit `atlas.scenarios.ts`.
 *
 * Shaped to drop straight into `atlas.config.ts`'s `scenarios` field, keyed by
 * component name — so wiring it up is a spread, not a migration.
 */
export function emitAtlasScenarios(doc: IrDocument): SourceFile {
  const f = new SourceFile(ATLAS_FILE)
  f.line()
  f.doc(
    `Atlas scenarios for ${doc.title}, derived from the spec.`,
    '',
    'Wire into `atlas.config.ts`:',
    '',
    '```ts',
    "import { scenarios } from './src/gen/atlas.scenarios'",
    'export default { scenarios }',
    '```',
    '',
    'Enum-valued fields expand to one scenario per value, so a variant axis the',
    'spec declares is one the workbench actually exercises.',
  )
  f.line('export const scenarios = {')

  let emitted = 0
  for (const [, ops] of byTag(doc)) {
    for (const op of ops) {
      if (isMutation(op) || op.pathParams.length > 0) continue
      const component = `${typeIdent(op.id)}Data`
      const cases = scenariosFor(op, doc)
      if (cases.length === 0) continue
      emitted++
      f.line(`  ${q(component)}: [`)
      for (const c of cases) {
        f.line(`    { name: ${q(c.name)}, args: ${jsonLiteral(c.args)} },`)
      }
      f.line('  ],')
    }
  }
  f.line('}')
  if (emitted === 0) {
    f.line()
    f.doc('No scenario-bearing operations in this spec (all are mutations or take path params).')
  }
  return f
}

interface Scenario {
  name: string
  args: Record<string, unknown>
}

/**
 * Scenarios for one operation: a baseline, plus one per enum value found on a
 * top-level response field.
 *
 * Deliberately shallow — expanding every enum at every depth is a combinatorial
 * explosion that fills the workbench with noise nobody looks at.
 */
function scenariosFor(op: IrOperation, doc: IrDocument): Scenario[] {
  const out: Scenario[] = [{ name: 'Default', args: {} }]
  const shape = resolve(op.response, doc)
  const fields: readonly IrField[] =
    shape?.kind === 'object' ? shape.fields : shape?.kind === 'array' ? objFields(shape.items, doc) : []
  for (const field of fields) {
    if (field.type.kind !== 'string' || !field.type.enum) continue
    for (const value of field.type.enum) {
      out.push({ name: `${field.name}: ${value}`, args: { [field.name]: value } })
    }
    // One enum axis is enough to make the point; more becomes a cross-product.
    break
  }
  return out
}

function objFields(type: IrType | undefined, doc: IrDocument): readonly IrField[] {
  const r = resolve(type, doc)
  return r?.kind === 'object' ? r.fields : []
}

function resolve(type: IrType | undefined, doc: IrDocument): IrType | undefined {
  if (!type) return undefined
  if (type.kind !== 'ref') return type
  const model = doc.models.find((m) => m.name === type.name)
  return model ? resolve(model.type, doc) : undefined
}
