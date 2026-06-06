import { promises as fs } from 'node:fs'
import path from 'node:path'
import fg from 'fast-glob'

// ─── src/mdx convention scanner ───────────────────────────────────────────
//
// Walks `<root>/src/mdx/**/*.{ts,tsx,js,jsx}` and discovers component
// exports — the dropped-file convention so users don't have to wire
// components in `vite.config.ts`. Returns a map from PascalCase
// component name → import path.
//
// Resolution rules (PascalCase = uppercase first letter):
//
//   1. The file's `default export` becomes a component named after the
//      file's basename if PascalCase (e.g. `Playground.tsx` → name
//      `Playground`); otherwise the default export is skipped.
//
//   2. Every PascalCase named export (`export const Note = ...`,
//      `export function Card(...) {}`) becomes a component with that
//      name. The file's basename does not factor in.
//
//   3. `_`-prefixed files are EXCLUDED (`_internal.tsx` is the escape
//      hatch for `defineComponents` bundles per the design).
//
//   4. Nested subdirectories are walked recursively. Component names
//      MUST be unique across the entire `src/mdx/` tree — duplicates
//      produce a `ScanDuplicate` finding so the build can fail loud.
//
// The scanner is intentionally syntactic — no TypeScript type-checking,
// no `import` resolution — same shape as the islands-audit scanner
// (which works well at island scale and stays fast for big trees).

export interface ScannedComponent {
  /** PascalCase component name. */
  name: string
  /** Absolute file path. */
  filePath: string
  /** Export kind. `default` means the file's default export should be
   *  imported with `import Name from path`; `named` means
   *  `import { Name } from path`. */
  kind: 'default' | 'named'
}

export interface ScanDuplicate {
  name: string
  files: string[]
}

export interface ScanResult {
  components: ScannedComponent[]
  duplicates: ScanDuplicate[]
  /** Absolute file paths that contribute components — useful for HMR
   *  invalidation. */
  files: string[]
}

/**
 * Scan `<root>/src/mdx/` and return discovered components + any name
 * collisions. Convenience wrapper for the standard convention layout —
 * `scanMdxDir(dir)` does the actual work.
 */
export function scanMdxComponents(root: string): Promise<ScanResult> {
  return scanMdxDir(path.join(root, 'src', 'mdx'))
}

/**
 * Walk an explicit `src/mdx`-equivalent directory and return discovered
 * components + collisions. Returns an empty result when the directory
 * doesn't exist — that's the supported convention for projects that
 * don't use MDX components.
 */
export async function scanMdxDir(dir: string): Promise<ScanResult> {
  let stat
  try {
    stat = await fs.stat(dir)
  } catch {
    return { components: [], duplicates: [], files: [] }
  }
  if (!stat.isDirectory()) return { components: [], duplicates: [], files: [] }
  const entries = await fg(['**/*.{ts,tsx,js,jsx}'], {
    cwd: dir,
    absolute: true,
    dot: false,
    onlyFiles: true,
  })

  const byName = new Map<string, ScannedComponent[]>()
  const files: string[] = []
  for (const filePath of entries) {
    const basename = path.basename(filePath)
    if (basename.startsWith('_')) continue
    const source = await fs.readFile(filePath, 'utf8')
    const found = extractPascalExports(source, filePath)
    if (found.length === 0) continue
    files.push(filePath)
    for (const comp of found) {
      const list = byName.get(comp.name) ?? []
      list.push(comp)
      byName.set(comp.name, list)
    }
  }

  const components: ScannedComponent[] = []
  const duplicates: ScanDuplicate[] = []
  for (const [name, list] of byName) {
    if (list.length === 1) {
      components.push(list[0]!)
    } else {
      duplicates.push({ name, files: list.map((c) => c.filePath).sort() })
      // Keep the FIRST occurrence so the rest of the build can proceed;
      // the duplicate warning is emitted separately so the user can
      // see ALL collisions, not just the first.
      components.push(list[0]!)
    }
  }
  components.sort((a, b) => a.name.localeCompare(b.name))
  duplicates.sort((a, b) => a.name.localeCompare(b.name))
  return { components, duplicates, files: files.sort() }
}

/**
 * Extract PascalCase exports from a source file. Syntactic regex match
 * — fast, robust enough for the convention scanner's purposes.
 *
 * Matches:
 *   - `export default function FooBar() {...}` → named `FooBar` (default
 *     export, but the name is taken from the function name).
 *   - `export default FooBar` → named `FooBar` (re-exporting an
 *     existing binding).
 *   - `export default function() {...}` / `export default () => …` →
 *     name taken from the file's basename if PascalCase.
 *   - `export const FooBar = ...`
 *   - `export function FooBar(...) {...}`
 *   - `export { FooBar }` and `export { FooBar as default }`
 *
 * @internal exported for testing
 */
export function extractPascalExports(
  source: string,
  filePath: string,
): ScannedComponent[] {
  const result: ScannedComponent[] = []
  const seen = new Set<string>()
  const basenameStem = path.basename(filePath).replace(/\.[^.]+$/, '')

  const push = (name: string, kind: ScannedComponent['kind']) => {
    if (!isPascalCase(name)) return
    if (seen.has(name)) return
    seen.add(name)
    result.push({ name, filePath, kind })
  }

  // Default export forms.
  // 1) `export default function Name(...) {`
  for (const m of source.matchAll(/export\s+default\s+function\s+([A-Z][A-Za-z0-9_$]*)/g)) {
    push(m[1]!, 'default')
  }
  // 2) `export default Name` (re-export of a named binding).
  for (const m of source.matchAll(
    /export\s+default\s+([A-Z][A-Za-z0-9_$]*)\s*[;\n]/g,
  )) {
    push(m[1]!, 'default')
  }
  // 3) `export default (props) => …` / `function() {` / `class {` — anonymous;
  //    fall back to the file's basename stem when PascalCase.
  if (
    /export\s+default\s+(function\s*\(|class\s*\{|\(|\{|async\s+\()/.test(source)
    && isPascalCase(basenameStem)
    && !seen.has(basenameStem)
  ) {
    push(basenameStem, 'default')
  }

  // Named exports.
  // `export const Name = ...` / `export let Name = ...` / `export var Name = ...`
  for (const m of source.matchAll(
    /export\s+(?:const|let|var)\s+([A-Z][A-Za-z0-9_$]*)/g,
  )) {
    push(m[1]!, 'named')
  }
  // `export function Name(...) {}`
  for (const m of source.matchAll(
    /export\s+function\s+([A-Z][A-Za-z0-9_$]*)/g,
  )) {
    push(m[1]!, 'named')
  }
  // `export { Name }` / `export { Name as default }` — strip braces.
  for (const m of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    const body = m[1]!
    for (const piece of body.split(',')) {
      const trimmed = piece.trim()
      // `Foo as default` → Foo becomes the default export
      const asDefaultMatch = trimmed.match(/^([A-Z][A-Za-z0-9_$]*)\s+as\s+default$/)
      if (asDefaultMatch) {
        push(asDefaultMatch[1]!, 'default')
        continue
      }
      // `Foo as Bar` → name is `Bar`
      const asAlias = trimmed.match(/^[A-Za-z0-9_$]+\s+as\s+([A-Z][A-Za-z0-9_$]*)$/)
      if (asAlias) {
        push(asAlias[1]!, 'named')
        continue
      }
      // `Foo` → name is `Foo`
      const bare = trimmed.match(/^([A-Z][A-Za-z0-9_$]*)$/)
      if (bare) {
        push(bare[1]!, 'named')
      }
    }
  }

  return result
}

/** Whether a string starts with an uppercase ASCII letter. */
export function isPascalCase(s: string): boolean {
  return s.length > 0 && s[0]! >= 'A' && s[0]! <= 'Z'
}

/**
 * Render the virtual module body from a scan result. Each component
 * gets a separate import line + the module re-exports them all.
 *
 * @internal exported for testing
 */
/**
 * The set of built-in component names that ship with
 * `@pyreon/zero-content` and MUST be re-exported by the virtual module
 * alongside any user-scanned components. The markdown compiler's
 * `emitJsx` references these by bare name (e.g. `<CodeBlock>` for
 * highlighted fenced code, `<Callout>` for `::: tip` blocks) and
 * registers them via `mdxComponentRef` — `compileMarkdown` then emits
 * `import { CodeBlock } from 'virtual:zero-content/components'` at
 * the top of the compiled `.tsx`. Without this re-export the
 * compiled module fails with `"CodeBlock" is not exported by
 * "virtual:zero-content/components"`.
 */
// Imported from `_shared/built-ins` — single source of truth shared with
// `mdx-scan/validate.ts` so the validator's "did you mean…?" suggestions
// and the virtual-module re-export stay in lock-step.
//
// Previously this was a local `const ['Callout', 'CodeGroup', 'CodeBlock']`
// while `validate.ts` carried its own `['Callout', 'CodeBlock', 'CodeGroup']`
// — silent drift waiting to happen when a new built-in lands.
import { BUILT_IN_COMPONENTS } from '../_shared/built-ins'

export function renderVirtualModule(scan: ScanResult): string {
  const imports: string[] = []
  const names: string[] = []
  let idx = 0

  // User-scanned components win when their PascalCase name collides
  // with a built-in (`Playground.tsx` in `src/mdx/` overrides the
  // built-in `<Playground>`). This is the documented escape hatch
  // for projects that want a custom Playground / PackageBadge / etc.
  const scannedNames = new Set(scan.components.map((c) => c.name))
  const builtInsToExport = BUILT_IN_COMPONENTS.filter(
    (n) => !scannedNames.has(n),
  )

  // Always re-export the built-ins users HAVEN'T overridden. Aliased
  // via `__b<N>` so the local binding is internal — the public name
  // is the export at the bottom of the file.
  for (const name of builtInsToExport) {
    const alias = `__b${idx++}`
    imports.push(`import { ${name} as ${alias} } from '@pyreon/zero-content'`)
    names.push(`${name}: ${alias}`)
  }

  for (const comp of scan.components) {
    const alias = `__c${idx++}`
    const spec = JSON.stringify(comp.filePath)
    imports.push(
      comp.kind === 'default'
        ? `import ${alias} from ${spec}`
        : `import { ${comp.name} as ${alias} } from ${spec}`,
    )
    names.push(`${comp.name}: ${alias}`)
  }

  const allNames = [
    ...builtInsToExport,
    ...scan.components.map((c) => c.name),
  ]

  return `// Auto-generated by @pyreon/zero-content. Do not edit.
${imports.join('\n')}

const __components = { ${names.join(', ')} }

export const __components_meta__ = ${JSON.stringify(allNames)}

export default __components

${allNames.map((n) => `export const ${n} = __components.${n}`).join('\n')}
`
}

/**
 * PR-G audit C3 — render a single-component virtual sub-module body.
 *
 * The compiled markdown imports each referenced component from
 * `virtual:zero-content/components/<Name>` instead of the barrel.
 * Vite invalidates each sub-module independently when the source
 * file changes, so editing one `src/mdx/Foo.tsx` only invalidates
 * pages that imported `Foo` — not every `.md` in the project (the
 * pre-fix barrel cascade).
 *
 * The sub-module is a thin re-export of the barrel's named binding.
 * That keeps the actual import resolution + scanner duplicate handling
 * + identity guarantees on the barrel (one canonical instance per
 * component), while letting Vite's module graph have a finer-grained
 * invalidation node per component name.
 *
 * @internal exported for testing
 */
export function renderPerComponentVirtual(name: string): string {
  return `// Auto-generated by @pyreon/zero-content. Do not edit.
// Per-component re-export — see scanner.ts:renderPerComponentVirtual.
export { ${name} } from 'virtual:zero-content/components'
`
}
