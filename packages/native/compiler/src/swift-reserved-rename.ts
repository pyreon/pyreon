/**
 * A user type named like a Swift / SwiftUI / Foundation / Pyreon-runtime name is emitted with a trailing `_`.
 *
 * An iOS app compiles each dependency's `native/swift/*.swift` INTO the app target, next to the generated code. Swift
 * resolves a bare name to a type of the CURRENT module before an imported one, so an app type declared at module
 * scope shadows every bare use of that name in those runtime files. `examples/native-tasks` declares
 * `type Task = { … }`: `Task { … }` in `PyreonWebView.swift` became a call of the model's `init(from: Decoder)` and
 * the iOS build failed. `Error`, `Data`, `Color`, `State`, `Group`, `Binding`, `Button`, `Identifiable`, `URL` break
 * other runtime files the same way, and `View` / `Text` / `Date` break the generated file itself. Kotlin has no such
 * class: the generated code lives in its own package (`--kotlin-package`), which the runtime packages never import.
 *
 * The fix is a rename, not an error, because the name is not part of anything the app observes: Codable / JSON keys
 * are property names, a TS type name never reaches the wire, and every file of an app compiles into one Swift module,
 * so all that matters is that the declaring file and every file that names the type agree. The rename is a pure
 * function of the NAME, so they do without seeing each other: each file renames what it declares at top level and
 * what it imports from a sibling module.
 *
 * This is a source-to-source pass that runs before parsing, so every later pass (props destructuring, hook inlining,
 * plugins that slice the source) sees one consistent spelling. Namespaces are respected: `interface Error` renames
 * type positions only, so `new Error('x')` still constructs the global one.
 *
 * The reserved set is GENERATED from the runtime sources (`swift-reserved-names.ts`); the Swift primitive spellings
 * (`type Int = number`, a documented way to pick a native number type) are exempt.
 */

import { parseSync } from 'oxc-parser'
import { SWIFT_RESERVED_NAMES } from './swift-reserved-names'

// The oxc AST is walked loosely, as everywhere else in this package.
// oxlint-disable-next-line typescript/no-explicit-any
type Node = any

/** Names with a meaning the compiler gives them by spelling: a user alias `type Int = number` selects Swift's `Int`. */
const PRIMITIVE_SPELLINGS: ReadonlySet<string> = new Set(['Double', 'Float', 'Int', 'Bool', 'String'])

/** Whether a user declaration named `name` must be renamed in Swift. */
export function isSwiftReservedName(name: string | undefined): boolean {
  return name !== undefined && SWIFT_RESERVED_NAMES.has(name) && !PRIMITIVE_SPELLINGS.has(name)
}

/** The Swift spelling of a reserved user name. */
export const swiftRenamed = (name: string): string => `${name}_`

/** A module the app itself owns: relative, or a path alias (`@/`, `~/`, `#…`). Package imports are never renamed. */
const isAppModule = (spec: string): boolean => /^(?:\.{1,2}(?:\/|$)|@\/|~\/?|#)/.test(spec)

export interface SwiftReservedRename {
  /** The source with every reserved user name renamed. */
  readonly code: string
  /** The original names that were renamed, sorted. */
  readonly renamed: readonly string[]
}

/** Every binding identifier of a declaration pattern (`a`, `{ a, b: c }`, `[a, ...b]`, `a = 1`). */
function patternNames(p: Node, out: string[]): void {
  if (!p) return
  if (p.type === 'Identifier') out.push(p.name)
  else if (p.type === 'ObjectPattern') for (const prop of p.properties) patternNames(prop.type === 'RestElement' ? prop.argument : prop.value, out)
  else if (p.type === 'ArrayPattern') for (const el of p.elements) patternNames(el, out)
  else if (p.type === 'AssignmentPattern') patternNames(p.left, out)
  else if (p.type === 'RestElement') patternNames(p.argument, out)
}

/** The quick pre-check: does the source spell any reserved name at all? Saves a parse on almost every file. */
function mentionsReserved(source: string): boolean {
  for (const m of source.matchAll(/\b[A-Z][A-Za-z0-9_]+\b/g)) if (isSwiftReservedName(m[0])) return true

  return false
}

/** What a file's top level binds under a reserved name, by namespace. */
interface Bindings {
  /** Names bound in the type namespace (an interface, a type alias, a class, an enum, an import). */
  readonly types: Set<string>
  /** Names bound in the value namespace (a function, a variable, a class, an enum, a value import). */
  readonly values: Set<string>
  /** Namespace imports of the app's own modules: `M.Task` names the sibling's `Task`. */
  readonly namespaces: Set<string>
  /** Whether the file names a sibling's reserved export without binding it (`import { Task as Todo }`, a re-export). */
  siblingExports: boolean
}

function bind(b: Bindings, name: string | undefined, type: boolean, value: boolean): void {
  if (!isSwiftReservedName(name)) return
  if (type) b.types.add(name!)
  if (value) b.values.add(name!)
}

function bindImport(b: Bindings, top: Node): void {
  if (!isAppModule(top.source.value)) return
  for (const sp of top.specifiers ?? []) {
    if (sp.type === 'ImportNamespaceSpecifier') {
      b.namespaces.add(sp.local.name)
      continue
    }
    if (sp.type === 'ImportSpecifier' && isSwiftReservedName(sp.imported?.name)) b.siblingExports = true
    // An import may name either namespace, and TS does not fall back to the global for the other one.
    const typeOnly = top.importKind === 'type' || sp.importKind === 'type'
    bind(b, sp.local.name, true, !typeOnly)
  }
}

function bindDeclaration(b: Bindings, decl: Node): void {
  if (!decl || decl.declare === true) return
  if (decl.type === 'TSInterfaceDeclaration' || decl.type === 'TSTypeAliasDeclaration') bind(b, decl.id?.name, true, false)
  else if (decl.type === 'ClassDeclaration' || decl.type === 'TSEnumDeclaration') bind(b, decl.id?.name, true, true)
  else if (decl.type === 'FunctionDeclaration') bind(b, decl.id?.name, false, true)
  else if (decl.type === 'VariableDeclaration') {
    const names: string[] = []
    for (const d of decl.declarations) patternNames(d.id, names)
    for (const n of names) bind(b, n, false, true)
  }
}

/** The reserved names `body` binds at top level. */
function collectBindings(body: readonly Node[]): Bindings {
  const b: Bindings = { types: new Set(), values: new Set(), namespaces: new Set(), siblingExports: false }
  for (const top of body) {
    if (top.type === 'ImportDeclaration') bindImport(b, top)
    else if (top.type === 'ExportNamedDeclaration' && top.source) {
      // A re-export of a sibling's name binds nothing here, but is renamed like an import.
      if (!isAppModule(top.source.value)) continue
      for (const sp of top.specifiers ?? []) {
        if (isSwiftReservedName(sp.local?.name) || isSwiftReservedName(sp.exported?.name)) b.siblingExports = true
      }
    } else bindDeclaration(b, top.type === 'ExportNamedDeclaration' || top.type === 'ExportDefaultDeclaration' ? top.declaration : top)
  }

  return b
}

const AST_META_KEYS: ReadonlySet<string> = new Set(['type', 'start', 'end', 'range', 'loc'])

/** Keys of a member-like node that are names, not bindings (`{ Task: 1 }`, `class { Task = 1 }`). */
const MEMBER_NODES: ReadonlySet<string> = new Set([
  'PropertyDefinition', 'MethodDefinition', 'TSPropertySignature', 'TSMethodSignature',
  'TSAbstractPropertyDefinition', 'TSAbstractMethodDefinition', 'AccessorProperty',
])

/** Nodes with nothing to rename inside: labels, ambient modules, `import('x').T`, `export * from`. */
const OPAQUE_NODES: ReadonlySet<string> = new Set([
  'BreakStatement', 'ContinueStatement', 'TSModuleDeclaration', 'TSImportType', 'ExportAllDeclaration',
])

/** One walk over a file, collecting the edits that rename its reserved bindings. */
class Renamer {
  readonly edits = new Map<number, { end: number; text: string }>()
  readonly renamed = new Set<string>()
  private readonly handlers: Record<string, (n: Node) => void>

  constructor(private readonly b: Bindings) {
    const { types, values } = b
    this.handlers = {
      Identifier: (n) => {
        this.renameIf(n, values)
        this.visit(n.typeAnnotation)
      },
      JSXIdentifier: (n) => this.renameIf(n, values),
      TSTypeReference: (n) => {
        this.typePosition(n.typeName)
        this.visit(n.typeArguments)
      },
      TSInterfaceHeritage: (n) => this.heritage(n),
      TSClassImplements: (n) => this.heritage(n),
      TSTypeParameter: (n) => {
        this.renameIf(n.name, types)
        this.visit([n.constraint, n.default])
      },
      TSInterfaceDeclaration: (n) => {
        this.renameIf(n.id, types)
        this.visit([n.typeParameters, n.extends, n.body])
      },
      TSTypeAliasDeclaration: (n) => {
        this.renameIf(n.id, types)
        this.visit([n.typeParameters, n.typeAnnotation])
      },
      ClassDeclaration: (n) => this.typeAndValue(n),
      ClassExpression: (n) => this.typeAndValue(n),
      TSEnumDeclaration: (n) => this.typeAndValue(n),
      MemberExpression: (n) => {
        this.visit(n.object)
        if (n.computed) this.visit(n.property)
        else this.namespaceMember(n.object, n.property)
      },
      JSXMemberExpression: (n) => this.visit(n.object),
      // `typeof M.x`: a value path whose members are not bindings of this file.
      TSQualifiedName: (n) => {
        this.visit(n.left)
        this.namespaceMember(n.left, n.right)
      },
      Property: (n) => this.property(n),
      TSEnumMember: (n) => this.visit(n.initializer),
      JSXAttribute: (n) => this.visit(n.value),
      LabeledStatement: (n) => this.visit(n.body),
      ImportDeclaration: (n) => this.importDeclaration(n),
      ExportNamedDeclaration: (n) => this.exportNamed(n),
    }
  }

  visit(n: Node): void {
    if (Array.isArray(n)) {
      for (const c of n) this.visit(c)
      return
    }
    if (!n || typeof n !== 'object' || typeof n.type !== 'string' || OPAQUE_NODES.has(n.type)) return
    const handler = this.handlers[n.type]
    if (handler) handler(n)
    else if (MEMBER_NODES.has(n.type)) {
      for (const k of Object.keys(n)) if (k !== 'key' || n.computed) this.visit(n[k])
    } else for (const k of Object.keys(n)) if (!AST_META_KEYS.has(k)) this.visit(n[k])
  }

  // The edit covers the NAME only: oxc's span for a binding identifier includes its type annotation
  // (`NO_GRADIENT: SeriesGradient`), which has its own edits and must survive.
  private edit(id: Node, name: string, text = swiftRenamed(name)): void {
    this.renamed.add(name)
    this.edits.set(id.start, { end: id.start + name.length, text })
  }

  private renameIf(id: Node, set: ReadonlySet<string>): void {
    if ((id?.type === 'Identifier' || id?.type === 'JSXIdentifier') && set.has(id.name)) this.edit(id, id.name)
  }

  /** `M.Task` where `M` is a namespace import of an app module: the member is the sibling's (renamed) name. */
  private namespaceMember(object: Node, member: Node): void {
    if (object?.type !== 'Identifier' || !this.b.namespaces.has(object.name)) return
    if (member?.type === 'Identifier' && isSwiftReservedName(member.name)) this.edit(member, member.name)
  }

  /** A type position: the leftmost name of a (qualified) type reference. */
  private typePosition(n: Node): void {
    if (n?.type === 'Identifier') this.renameIf(n, this.b.types)
    else if (n?.type === 'TSQualifiedName') {
      this.typePosition(n.left)
      this.namespaceMember(n.left, n.right)
    }
  }

  private heritage(n: Node): void {
    this.typePosition(n.expression)
    this.visit(n.typeArguments)
  }

  private typeAndValue(n: Node): void {
    this.renameIf(n.id, this.b.types.has(n.id?.name) ? this.b.types : this.b.values)
    for (const k of Object.keys(n)) if (k !== 'id' && !AST_META_KEYS.has(k)) this.visit(n[k])
  }

  private property(n: Node): void {
    if (n.computed) this.visit(n.key)
    // `{ Task }` / `{ Task = x }`: key and value share one span, so the edit spells both.
    const id = n.value?.type === 'AssignmentPattern' ? n.value.left : n.value
    if (n.shorthand && id?.type === 'Identifier' && this.b.values.has(id.name)) {
      this.edit(id, id.name, `${id.name}: ${swiftRenamed(id.name)}`)
      if (n.value.type === 'AssignmentPattern') this.visit(n.value.right)
      return
    }
    this.visit(n.value)
  }

  private importDeclaration(n: Node): void {
    if (!isAppModule(n.source.value)) return
    for (const sp of n.specifiers ?? []) {
      if (sp.type === 'ImportNamespaceSpecifier') continue
      // The sibling's export is renamed by the sibling, whatever this file calls it.
      if (sp.type === 'ImportSpecifier' && sp.imported?.type === 'Identifier' && isSwiftReservedName(sp.imported.name)) {
        this.edit(sp.imported, sp.imported.name)
      }
      this.renameIf(sp.local, this.b.types.has(sp.local.name) ? this.b.types : this.b.values)
    }
  }

  private exportNamed(n: Node): void {
    if (n.declaration) {
      this.visit(n.declaration)
      return
    }
    const fromSibling = n.source !== null && n.source !== undefined
    if (fromSibling && !isAppModule(n.source.value)) return
    for (const sp of n.specifiers ?? []) {
      const local = sp.local
      const own = this.b.types.has(local?.name) || this.b.values.has(local?.name)
      if (local?.type === 'Identifier' && (fromSibling ? isSwiftReservedName(local.name) : own)) this.edit(local, local.name)
      // An `as Task` export name: every importer spells it `Task_`, so the export must too.
      const exported = sp.exported
      if (exported?.type === 'Identifier' && exported.start !== local?.start && isSwiftReservedName(exported.name)) {
        this.edit(exported, exported.name)
      }
    }
  }
}

/** `source` with each edit applied. */
function applyEdits(source: string, edits: ReadonlyMap<number, { end: number; text: string }>): string {
  let code = ''
  let at = 0
  for (const [start, e] of [...edits].sort((a, b) => a[0] - b[0])) {
    code += source.slice(at, start) + e.text
    at = e.end
  }

  return code + source.slice(at)
}

/**
 * Rename every reserved name `source` binds at top level (a declaration, or an import from one of the app's own
 * modules). `undefined` when there is nothing to rename or the source does not parse (the parser reports that).
 */
export function renameSwiftReservedNames(source: string, filename = 'input.tsx'): SwiftReservedRename | undefined {
  if (!mentionsReserved(source)) return undefined
  const ast = parseSync(filename, source, { sourceType: 'module', lang: 'tsx' })
  if (ast.errors.some((e: Node) => e.severity !== 'Warning')) return undefined
  const body = (ast.program as Node).body as Node[]
  const b = collectBindings(body)
  if (b.types.size === 0 && b.values.size === 0 && b.namespaces.size === 0 && !b.siblingExports) return undefined
  const renamer = new Renamer(b)
  renamer.visit(body)
  if (renamer.edits.size === 0) return undefined

  return { code: applyEdits(source, renamer.edits), renamed: [...renamer.renamed].sort() }
}

/** The comment an emit carries when it renamed something, so a hand-written Swift caller can find the new spelling. */
export function swiftRenameNote(renamed: readonly string[]): string {
  const list = renamed.map((n) => `\`${n}\` → \`${swiftRenamed(n)}\``).join(', ')
  return `// Pyreon: ${list} — the Swift runtime sources compiled into this app spell ${renamed.length === 1 ? 'that name' : 'those names'} bare, and an app type would shadow ${renamed.length === 1 ? 'it' : 'them'} (swift-reserved-rename.ts).\n`
}

/** `text` (a diagnostic) with each renamed name spelled as the source spells it. */
export function sourceSpelling(text: string, renamed: readonly string[]): string {
  let out = text
  for (const n of renamed) out = out.replace(new RegExp(`\\b${n}_(?!\\w)`, 'g'), n)

  return out
}
