/**
 * TypeScript keeps VALUES and TYPES in separate namespaces; Swift and Kotlin
 * do not.
 *
 *   export const Pet = s.object({ name: s.string() })
 *   export type Pet = { name: string }
 *
 * is the ordinary schema-plus-type idiom (and `const Status = {…} as const`
 * beside `type Status = …` is its enum twin). Emitted as-is it became
 * `let Pet = …` beside `struct Pet` — swiftc `invalid redeclaration of 'Pet'`
 * / kotlinc `conflicting declarations` — so no module using the idiom built on
 * either target, and generators had to invent their own names to dodge it.
 *
 * The TYPE keeps its name: it is what other files annotate with (`(p: Pet)`),
 * the decode target (`Pet.self`), and the half an author reaches for across a
 * file boundary. The VALUE is renamed — `Pet` → `PetValue` — and every
 * reference to it in this file follows. The IR keeps the two apart already
 * (types are `TypeIR`, reads are `identifier` expressions, schema links are
 * `schemaName` strings), so the rename touches values only, by construction.
 *
 * Scope, stated plainly: PMTC compiles one file at a time, so another file
 * that imports the VALUE (`import { Pet } from './pets'` and reads `Pet.parse`)
 * still says `Pet` and now reaches the struct. The type is the common import;
 * the value is not. A local binding of the same name (`const Pet = …` inside a
 * component) would be mis-renamed by a scope-blind walk, so it is detected
 * and the file is left as it was, with a named warning.
 */

import type { ParseResult } from './types'

/** The renamed value binding for a value/type pair named `name`, unique against `taken`. */
function valueNameFor(name: string, taken: ReadonlySet<string>): string {
  let candidate = `${name}Value`
  for (let i = 2; taken.has(candidate); i++) candidate = `${name}Value${i}`
  return candidate
}

type Node = Record<string, unknown>

/** Every object node reachable from `root`, depth-first. */
function* walk(root: unknown): Generator<Node> {
  const stack: unknown[] = [root]
  const seen = new Set<unknown>()
  while (stack.length > 0) {
    const x = stack.pop()
    if (x === null || typeof x !== 'object' || seen.has(x)) continue
    seen.add(x)
    if (Array.isArray(x)) {
      for (const el of x) stack.push(el)
      continue
    }
    if (x instanceof Map) {
      for (const v of x.values()) stack.push(v)
      continue
    }
    yield x as Node
    for (const v of Object.values(x as Node)) stack.push(v)
  }
}

/**
 * Does anything in `roots` BIND `name` locally — a `let`, a declaration, a
 * parameter, a loop variable, a component decl? The rename is scope-blind, so
 * a shadowing binding would have its reads renamed away from it.
 */
function locallyBound(roots: readonly unknown[], name: string): boolean {
  for (const root of roots) {
    for (const n of walk(root)) {
      const kind = n.kind
      if (kind === 'identifier' || kind === 'typeRef') continue
      // A struct field / prop entry is `{ name, type }` with no `kind`; a
      // field NAMED like the type is harmless (it is always a member access).
      if (kind === undefined && 'type' in n && !('initial' in n)) continue
      if (typeof kind === 'string' && n.name === name) return true
      if (n.item === name) return true
      const params = n.params
      if (Array.isArray(params) && params.some((p) => p === name || (p !== null && typeof p === 'object' && (p as Node).name === name))) {
        return true
      }
    }
  }
  return false
}

/**
 * Rename every file-scope VALUE binding that shares its name with a TYPE the
 * file declares, and every reference to it. Mutates `result` in place.
 */
export function disambiguateValueTypeNames(result: ParseResult): void {
  const typeNames = new Set<string>([...result.structs.map((s) => s.name), ...result.enums.map((e) => e.name)])
  if (typeNames.size === 0) return
  const valueNames = [
    ...result.moduleDecls.map((d) => d.name),
    ...result.zodSchemas.map((z) => z.bindingName),
    ...result.fieldMetas.map((f) => f.bindingName),
    ...result.features.map((f) => f.bindingName),
  ]
  const clashes = [...new Set(valueNames.filter((n) => typeNames.has(n)))]
  if (clashes.length === 0) return

  const taken = new Set<string>([
    ...typeNames,
    ...valueNames,
    ...result.components.map((c) => c.name),
    ...result.helperFns.map((f) => f.name),
  ])
  // The value side of the IR — everything but the type declarations.
  const valueRoots: unknown[] = [
    result.components,
    result.stores,
    result.models,
    result.helperFns,
    result.styledComponents,
    result.rocketstyleComponents,
    result.attrsComponents,
  ]
  const renames = new Map<string, string>()
  for (const name of clashes) {
    if (locallyBound(valueRoots, name)) {
      result.warnings.push(
        `\`${name}\` names both a type and a value in this file, and Swift and Kotlin share one namespace for ` +
          `the two — the file-scope value is normally renamed to \`${name}Value\` on native, but a LOCAL binding ` +
          `also called \`${name}\` makes that rename unsafe, so the pair is emitted as written and collides ` +
          `(\`invalid redeclaration\` / \`conflicting declarations\`). Rename the local.`,
      )
      continue
    }
    const to = valueNameFor(name, taken)
    taken.add(to)
    renames.set(name, to)
  }
  if (renames.size === 0) return

  for (const d of result.moduleDecls) d.name = renames.get(d.name) ?? d.name
  for (const defs of [result.zodSchemas, result.fieldMetas, result.features]) {
    for (const d of defs) d.bindingName = renames.get(d.bindingName) ?? d.bindingName
  }
  for (const root of [...valueRoots, result.moduleDecls, result.zodSchemas, result.fieldMetas, result.features]) {
    for (const n of walk(root)) {
      if (n.kind === 'identifier' && typeof n.name === 'string') {
        const to = renames.get(n.name)
        if (to !== undefined) n.name = to
      }
      if (typeof n.schemaName === 'string') {
        const to = renames.get(n.schemaName)
        if (to !== undefined) n.schemaName = to
      }
    }
  }
}
