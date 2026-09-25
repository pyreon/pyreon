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
  const files = result.files.filter((f) => /\.tsx?$/.test(f.path) && !f.path.endsWith('.native.tsx'))
  const written: string[] = []
  const write = (path: string, contents: string): void => {
    const abs = join(root, path)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, contents)
    written.push(abs)
  }
  for (const f of files) write(f.path, f.contents)
  for (const [path, contents] of Object.entries(options.extra ?? {})) write(path, contents)

  const program = ts.createProgram(written, {
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
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName.startsWith(root) === true)
    .map(
      (d) =>
        `${d.file?.fileName.slice(root.length + 1) ?? '?'}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
    )
  return { errors, result, root }
}

export function cleanTypecheck(name: string): void {
  rmSync(join(ROOT, name), { recursive: true, force: true })
}
