/**
 * Deterministic sample values, shared by every emitter that needs one.
 *
 * Mocks, JSDoc examples and preview arguments used to be free to disagree
 * about what a "sample `Pet`" is. Deriving all three here means the example a
 * reader copies out of a hover is the value the mock returns.
 */
import { modelIndex } from './graph'
import type { IrDocument, IrField, IrType } from './ir'
import { conforms, sampleNumber, sampleString } from './sample'

/**
 * A deterministic sample value for a type — the value the mock fixtures, the
 * generated `@example` blocks and the Atlas previews all agree on.
 *
 * A field's spec `example` wins when it satisfies the field's type; otherwise
 * the value is derived constraints-first (enum, pattern, length, range), with
 * no randomness, so the same spec always produces the same bytes.
 */
export function sampleValue(
  type: IrType,
  doc: IrDocument,
  depth = 0,
  field?: IrField,
  index = 0,
): unknown {
  // A spec `example` is used only when it satisfies the schema it sits in —
  // real specs carry examples that contradict their own types (audit C7).
  if (field?.example !== undefined && conforms(field.example, type, (n) => modelType(doc, n))) {
    return field.example
  }
  if (depth > 6) return null
  switch (type.kind) {
    case 'enum':
      return type.values[0]
    case 'nullable':
      // The non-null shape: a fixture of `null` renders nothing, so it tests
      // nothing. A nullable OPTIONAL field is omitted below instead.
      return sampleValue(type.inner, doc, depth, field, index)
    case 'string':
      return sampleString(type, field, index)
    case 'number':
      return sampleNumber(type, index)
    case 'boolean':
      return true
    case 'null':
      return null
    case 'unknown':
      return null
    case 'array': {
      // Two elements: one is indistinguishable from a scalar in a UI, three is
      // noise. Two proves the list renders. The INDEX is threaded so the
      // elements differ — identical elements share an id, which collapses a
      // keyed `<For>` to one row and trips the duplicate-key warning, so a
      // fixture that ships them tests the opposite of what it looks like.
      //
      // `minItems` / `maxItems` win over the two: a fixture the generated
      // schema rejects fails every test that uses it, with a validation error
      // about data the test never wrote.
      const n = Math.min(Math.max(2, type.minItems ?? 0), type.maxItems ?? Number.POSITIVE_INFINITY)
      return Array.from({ length: n }, (_, i) => sampleValue(type.items, doc, depth + 1, undefined, i + 1))
    }
    case 'ref': {
      const model = modelIndex(doc).get(type.name)
      return model ? sampleValue(model.type, doc, depth + 1, undefined, index) : null
    }
    case 'union':
      return type.options.length > 0 ? sampleValue(type.options[0] as IrType, doc, depth + 1) : null
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const f of type.fields) {
        // Optional fields are included when they carry an example, and when
        // they are an ENUM — an enum drives a visible variant (a status badge,
        // a filter), so a fixture that omits it renders the one state a UI
        // never has to handle. Other optionals stay out to keep fixtures small.
        const base = f.type.kind === 'nullable' ? f.type.inner : f.type
        const isEnum = base.kind === 'enum'
        if (!f.required && f.example === undefined && !isEnum) continue
        out[f.name] = sampleValue(f.type, doc, depth + 1, f, index)
      }
      return out
    }
  }
}

function modelType(doc: IrDocument, name: string): IrType | undefined {
  return modelIndex(doc).get(name)?.type
}
