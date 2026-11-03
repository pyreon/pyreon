import {
  kotlinStr,
  swiftStr,
  type ItemBindings,
  type ModuleItemEmitter,
} from '@pyreon/native-compiler/plugin-api'
export { safeParseExpr } from '@pyreon/validation/native-plugin'
import type { FieldMetaDefnIR } from './ir'

const fieldMetaOf = (item: { payload: unknown }): FieldMetaDefnIR => item.payload as FieldMetaDefnIR

/** The native type and literal for a meta value. Swift and Kotlin share `Int`/`Double`/`String`; only the boolean
 *  type name differs. A whole number outside 32-bit range is a `Double`, since Kotlin's `Int` is 32-bit. */
function metaLiteral(
  value: string | number | boolean,
  str: (s: string) => string,
  boolType: string,
): [string, string] {
  if (typeof value === 'string') return ['String', str(value)]
  if (typeof value === 'boolean') return [boolType, String(value)]
  if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) return ['Int', String(value)]
  const text = String(value)
  return ['Double', /[.eE]/.test(text) ? text : `${text}.0`]
}

const fieldMetaBindings: ItemBindings = {
  names: (item) => [item.name],
  rename(item, renames) {
    const fm = fieldMetaOf(item)
    fm.bindingName = renames.get(fm.bindingName) ?? fm.bindingName
    item.name = fm.bindingName
  },
}

/**
 * `withField` metadata. PMTC discards the schema argument and emits a per-binding struct holding the literal
 * `meta` fields. Downstream native code uses `emailField.label` etc. directly via the emitted struct.
 *
 *   struct PyreonFieldMeta_emailField {
 *       let label: String = "Email"
 *       let placeholder: String = "name@example.com"
 *   }
 *   let emailField = PyreonFieldMeta_emailField()
 */
export const fieldMetaItem: ModuleItemEmitter = {
  // Metadata emits right after the models, ahead of the features and the schemas.
  after: 'models',
  legacyList: 'fieldMetas',
  bindings: fieldMetaBindings,
  swift(item) {
    const fm = fieldMetaOf(item)
    const lines: string[] = []
    lines.push(`struct PyreonFieldMeta_${fm.bindingName} {`)
    for (const m of fm.meta) {
      const [type, literal] = metaLiteral(m.value, swiftStr, 'Bool')
      lines.push(`    let ${m.name}: ${type} = ${literal}`)
    }
    lines.push(`}`)
    lines.push(``)
    lines.push(`let ${fm.bindingName} = PyreonFieldMeta_${fm.bindingName}()`)
    return [lines.join('\n')]
  },
  /**
   *   data class PyreonFieldMeta_emailField(
   *       val label: String = "Email",
   *       val placeholder: String = "name@example.com",
   *   )
   *   val emailField = PyreonFieldMeta_emailField()
   */
  kotlin(item) {
    const fm = fieldMetaOf(item)
    const lines: string[] = []
    lines.push(`data class PyreonFieldMeta_${fm.bindingName}(`)
    for (const m of fm.meta) {
      const [type, literal] = metaLiteral(m.value, kotlinStr, 'Boolean')
      lines.push(`    val ${m.name}: ${type} = ${literal},`)
    }
    lines.push(`)`)
    lines.push(``)
    lines.push(`val ${fm.bindingName} = PyreonFieldMeta_${fm.bindingName}()`)
    return [lines.join('\n')]
  },
}
