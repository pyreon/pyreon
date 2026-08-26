/**
 * `@pyreon/lathe` — spec-to-Pyreon code generation.
 *
 * Reads an OpenAPI document and emits a typed client for the Pyreon stack:
 * `@pyreon/validate` schemas, `@pyreon/http` endpoints, `@pyreon/query` hooks,
 * mock fixtures and Atlas scenarios.
 *
 * The part that is not like other generators is `target: 'multiplatform'`. The
 * native compiler (PMTC) lowers a SUBSET of TypeScript to Swift and Kotlin, and
 * hand-written app code drifts out of that subset constantly. Generated code
 * does not have to: Lathe emits inside the subset by construction — including
 * choosing a file layout no human would tolerate, because PMTC has no module
 * graph and only ever sees one file at a time — and then runs the real compiler
 * over its own output to CHECK, rather than claim, that it lowered.
 *
 * @example
 * ```ts
 * import { generate, resolveConfig } from '@pyreon/lathe'
 *
 * const config = resolveConfig({ input: './openapi.yaml', target: 'multiplatform' })
 * const { files, reach } = generate(specText, config)
 * ```
 */
import { name as pkgName, version as pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

registerSingleton(pkgName, pkgVersion, import.meta.url)

export * from './core'
