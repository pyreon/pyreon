/** Package-owned FFI lowering. Runtime imports never load this tooling entry. */
import type {
  AstNode,
  CallRecognizer,
  CompilerModule,
  CompilerPlugin,
  StructIR,
} from '@pyreon/native-compiler/plugin-api'
export const recognizeNativeModule: CallRecognizer = (_call, ctx) => {
  const name = ctx.declName
  const arg = ctx.args[0] as (AstNode & { value?: unknown }) | undefined
  const moduleName =
    arg?.type === 'Literal' || arg?.type === 'StringLiteral' ? (arg.value as unknown) : undefined
  if (typeof moduleName !== 'string' || moduleName.length === 0) {
    ctx.report(
      `useNativeModule \`${name}\`: the module name must be a non-empty STRING LITERAL at the call site (e.g. useNativeModule<T>('Bluetooth')) — it is emitted verbatim as the Swift/Kotlin class name and PMTC resolves one file at a time, so an imported or computed name has no value here. Declaration skipped on native.`,
    )
    return null
  }
  // Emitted verbatim as a native TYPE name, so it must be a plain
  // identifier. Rejecting anything else keeps arbitrary text out of the
  // generated Swift/Kotlin (a name like `Foo(); evil()` would otherwise
  // be spliced straight into the output).
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(moduleName)) {
    ctx.report(
      `useNativeModule \`${name}\`: module name "${moduleName}" is not a valid identifier — it is emitted directly as a Swift/Kotlin class name, so it must match /^[A-Za-z_][A-Za-z0-9_]*$/. Declaration skipped on native.`,
    )
    return null
  }
  return { type: 'native-module', payload: { moduleName } }
}
/**
 * `SelectOption` — the `<Select options>` element type — as the runtimes
 * declare it (`PyreonSelectOption`, aliased `SelectOption`, in
 * runtime-swift / runtime-kotlin). EXTERNAL: it types object literals and
 * annotations in a file that imports it (`signal<SelectOption[]>([{ value,
 * label }])` constructs `SelectOption(value:label:)`), and is never declared in
 * the emit — the runtime already has it. Mirrors `types/input.ts`.
 */
export const SELECT_OPTION_STRUCT: StructIR = {
  name: 'SelectOption',
  fields: [
    { name: 'value', type: { kind: 'string' } },
    { name: 'label', type: { kind: 'string' } },
    { name: 'disabled', type: { kind: 'union', branches: [{ kind: 'boolean' }, { kind: 'undefined' }] } },
  ],
  external: true,
}

export const primitivesPlugin: CompilerPlugin = {
  name: '@pyreon/primitives',
  apiVersion: 2,
  modules: ['@pyreon/primitives'],
  calls: { useNativeModule: recognizeNativeModule },
  runtimeTypes: Object.freeze(['SelectOption']),
  prepareIR(module: CompilerModule) {
    // Only for a file that imports the type, and never over a local declaration
    // of the same name (that one is the file's own, and is emitted as such).
    let imported = false
    for (const [local, i] of module.typeImports ?? []) {
      if (i.source !== '@pyreon/primitives' || i.imported !== 'SelectOption') continue
      if (local === 'SelectOption') imported = true
      else
        module.warnings.push(
          `\`import type { SelectOption as ${local} }\`: the native runtimes name the type \`SelectOption\`, so a RENAMED import emits \`${local}\`, which exists on neither iOS nor Android. Import it as \`SelectOption\`.`,
        )
    }
    if (!imported || module.structs.some((s) => s.name === 'SelectOption')) return
    module.structs = [...module.structs, SELECT_OPTION_STRUCT]
  },
  decls: {
    'native-module': {
      legacyKind: 'native-module',
      swift: (decl, ctx) =>
        `@State private var ${ctx.ident(decl.name)} = ${decl.payload.moduleName}()`,
      kotlin: (decl, ctx) => {
        const id = ctx.ident(decl.name)
        return [
          `val ${id}Ctx = LocalContext.current`,
          `val ${id} = remember { ${decl.payload.moduleName}(${id}Ctx) }`,
        ].join('\n  ')
      },
    },
  },
}
export default primitivesPlugin
