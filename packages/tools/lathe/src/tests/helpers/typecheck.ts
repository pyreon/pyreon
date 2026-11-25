/**
 * Typecheck a generated tree with the real TypeScript compiler.
 *
 * Shared by the regression suites that assert "the output COMPILES" for a
 * specific spec shape. On disk, inside the package, for the reason
 * `generated-typecheck.test.ts` gives: resolution of the generated modules'
 * bare and relative specifiers is most of what is under test.
 */
import ts from 'typescript'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig, type LatheSection } from '../../core/config'
import { generate, type GenerateResult } from '../../core/generate'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '.generated', 'tc')
const CORE = join(HERE, '..', '..', '..', '..', '..', 'core', 'core', 'src')

/** Real compiler fixtures retain a bounded budget under coverage load. */
export const TYPECHECK_BUDGET = { timeout: 60_000 }

/** Every fixture tree is written under here; nothing below it is ever cached. */
const GENERATED = join(HERE, '..', '.generated')

/**
 * Parsed files that never change during a run — the `lib.*.d.ts` set and the
 * `@pyreon/core` source the fixtures resolve to — keyed by the compiler
 * options that shape a parse, then by file and parse options.
 *
 * Without it every `createProgram` re-parsed and re-bound `lib.dom.d.ts` and
 * the framework source, which was most of a typecheck fixture's cost and,
 * under V8 coverage instrumentation on a four-core runner, most of this
 * package's coverage run (it reached the 600 s measurement deadline). Sharing
 * a `SourceFile` between programs with the same options is what the
 * language service's document registry does; the checker keeps its own links.
 *
 * Bounded by the files a fixture can reach outside `.generated/` (a fixed
 * set), and it lives only as long as the test file's module: vitest isolates
 * each file, so the cache is dropped with it.
 */
const stableFiles = new Map<string, Map<string, ts.SourceFile | undefined>>()

/**
 * `ts.createProgram` over generated fixture files, reusing the parse of every
 * file that is NOT a fixture. Fixture files (under `.generated/`) are always
 * read fresh, since a test rewrites them.
 */
export function createFixtureProgram(
  entries: readonly string[],
  options: ts.CompilerOptions,
): ts.Program {
  const host = ts.createCompilerHost(options, true)
  const optionsKey = JSON.stringify(options)
  let cache = stableFiles.get(optionsKey)
  if (!cache) {
    cache = new Map()
    stableFiles.set(optionsKey, cache)
  }
  const parse = host.getSourceFile.bind(host)
  const files = cache
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    if (shouldCreateNewSourceFile || fileName.startsWith(GENERATED))
      return parse(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile)
    const key = `${fileName}\0${JSON.stringify(languageVersionOrOptions)}`
    if (files.has(key)) return files.get(key)
    const file = parse(fileName, languageVersionOrOptions, onError)
    files.set(key, file)
    return file
  }
  return ts.createProgram(entries, options, host)
}

/** Check authored fixture files while still resolving all imported types. */
export function generatedDiagnostics(
  program: ts.Program,
  entries: readonly string[],
): ts.Diagnostic[] {
  return entries.flatMap((entry) => {
    const file = program.getSourceFile(entry)
    if (!file) throw new Error(`TypeScript did not load generated fixture ${entry}`)
    return [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)]
  })
}

export interface TypecheckOptions {
  /** Extra consumer-side source files, keyed by path relative to the output root. */
  extra?: Record<string, string>
  /** `noUnusedLocals` + `noUnusedParameters` — common app settings. */
  noUnused?: boolean
}

export interface TypecheckResult {
  errors: string[]
  result: GenerateResult
  root: string
}

export function typecheckSpec(
  name: string,
  spec: string,
  config: Omit<LatheSection, 'input' | 'projects'> = {},
  options: TypecheckOptions = {},
): TypecheckResult {
  const cfg = resolveConfig({ input: 'x', ...config })
  const result = generate(spec, cfg)
  const root = join(ROOT, name)
  rmSync(root, { recursive: true, force: true })
  const files = result.files.filter(
    (f) => /\.tsx?$/.test(f.path) && !f.path.endsWith('.native.tsx'),
  )
  const written: string[] = []
  const write = (path: string, contents: string): void => {
    const abs = join(root, path)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, contents)
    written.push(abs)
  }
  for (const f of files) write(f.path, f.contents)
  for (const [path, contents] of Object.entries(options.extra ?? {})) write(path, contents)

  const program = createFixtureProgram(written, {
    strict: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: true,
    isolatedModules: true,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    customConditions: ['bun'],
    // `components.tsx` needs `@pyreon/core`, which this package does not
    // depend on — resolve it to the workspace source instead of adding a
    // dependency only a test would use.
    baseUrl: HERE,
    paths: {
      '@pyreon/core': [join(CORE, 'index.ts')],
      '@pyreon/core/jsx-runtime': [join(CORE, 'jsx-runtime.ts')],
      '@pyreon/core/jsx-dev-runtime': [join(CORE, 'jsx-dev-runtime.ts')],
    },
    jsx: ts.JsxEmit.Preserve,
    jsxImportSource: '@pyreon/core',
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    ...(options.noUnused ? { noUnusedLocals: true, noUnusedParameters: true } : {}),
  })
  // The workspace gate checks imported framework implementations once.
  // Checking them again here then filtering them out only wastes time.
  const errors = generatedDiagnostics(program, written).map(
    (d) =>
      `${d.file?.fileName.slice(root.length + 1) ?? '?'}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
  )
  return { errors, result, root }
}

export function cleanTypecheck(name: string): void {
  rmSync(join(ROOT, name), { recursive: true, force: true })
}
