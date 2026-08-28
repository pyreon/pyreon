import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/lathe',
  title: 'Spec-to-Client Generator',
  tagline:
    'OpenAPI in, typed Pyreon client out — schemas, endpoints, queries, mocks and Atlas scenarios, with a multiplatform mode that proves its own output lowers to Swift and Kotlin',
  description:
    'Lathe reads an OpenAPI 3.x document and emits a client for the Pyreon stack: `@pyreon/validate` schemas, `@pyreon/http` endpoint declarations, `@pyreon/query` hooks, deterministic mock fixtures, and `@pyreon/atlas` scenarios derived from the spec\'s own enums and examples. The spec parser is first-party — a YAML reader scoped to the OpenAPI subset that REFUSES anchors, tags and tab indentation rather than mis-reading them — so there is no third-party spec dependency to trust. What separates it from a conventional generator is `target: \'multiplatform\'`: the native compiler (PMTC) lowers only a SUBSET of TypeScript and has no module graph, so it recognises a client, a schema and a call only when they share ONE file\'s top level. Hand-written code drifts out of that constantly; generated code need not, so Lathe emits a self-contained module per tag — a layout no human would maintain and exactly the one the compiler wants — then runs the real compiler over its own output and checks for the POSITIVE marker (`PyreonQuery<`, `PyreonZodSchema_`), because zero warnings is not evidence of lowering.',
  category: 'universal',
  multiplatform: {
    tier: 'web-only',
    rationale:
      'the code generator — build-time tooling that emits app code, not app runtime itself',
  },
  features: [
    'First-party OpenAPI 3.x reader: JSON or YAML, local `$ref` resolution, `allOf` flattening through refs (the inheritance idiom), `oneOf`/`anyOf` with `discriminator`, 3.1 `type: [string, null]`, path-level parameters, and `{id}` → `:id` conversion to the `@pyreon/http` endpoint form',
    'Own YAML parser scoped to the OpenAPI subset — block maps/sequences, flow collections, block scalars, quote-aware colon splitting (a URL value and a quoted key both contain one) — that REFUSES anchors, merge keys, explicit tags and tab indentation with a line number rather than producing a subtly wrong document',
    'Loss is REPORTED, never silent: every spec feature the IR cannot represent becomes a `note` with a stable greppable `code` (`unsupported-schema`, `unsupported-ref`, `missing-operation-id`, `multiple-content-types`, `no-servers`) and a JSON-pointer location',
    '`target: \'multiplatform\'` emits an additional self-contained module per tag — client, schemas, endpoints and calls sharing one top level — because PMTC resolves nothing across file boundaries; the web output is unchanged, so enabling it can never make the web build worse',
    'The multiplatform claim is MEASURED: `verifyNative` runs the real `@pyreon/native-compiler` on both targets and asserts the positive marker plus the absence of leaked web-only symbols. A `does NOT compile` warning is treated as broken, not advisory, and an absent compiler SKIPS loudly rather than passing',
    'Per-operation native reach with a reason in spec terms: a path parameter is supplied at runtime and PMTC bakes URLs at compile time, so that operation is reported `web-only` by name instead of silently degrading',
    'Plugin selection is expanded along the IMPORT EDGES of the emitted code, not refused: `components` pulls in `queries` -> `client` -> `schemas` because `components.tsx` imports the hooks, and the report names what came along. Selecting a plugin without what its output imports previously produced files referencing modules that were never written - output that looks complete and does not resolve. `components` itself is independent of Atlas: the previews are ordinary Pyreon components over the generated hooks, so a project that wants them without a workbench gets exactly that',
    'Every emitter is opt-in via `plugins` (`types`/`schemas`/`client`/`queries`/`mocks`/`atlas`) — schemas alone is a first-class use, and `target` is ADDITIVE on top of the selection rather than a separate output, so asking for schemas gets schemas on both targets',
    'Several specs in ONE pass via `projects: [{ name, input, output }]` — each to its own path (typically another package in the workspace, which is the intended use), with `target`/`plugins` written once at the top level and overridable per project. `lathe check` covers them all and fails if any is stale; a CLI `--out` alongside `projects` is REFUSED rather than applied to every one',
    'A generated `index.ts` barrel and a `keys.ts` query-key registry: one import site regardless of how operations were tagged, and invalidation keys derived from the endpoints rather than hand-written literals that drift the moment a path changes (`keys.books.listBooks.all` matches every call; `.of(args)` matches one)',
    'The Atlas story is FULLY generated: `components.tsx` emits one browsable preview per read operation whose variant axis is the DATA STATE (a real prop, so Atlas infers a control), `atlas.scenarios.ts` keys those exact component names, and `atlas.wrapper.tsx` supplies the QueryClientProvider with the generated mocks installed so every card renders with NO server. Measured on the example: `atlas scan` reports 2 components, 8 scenarios, 8 verified, 0 failing, from an `atlas.config.ts` that names no component, scenario or provider',
    'Automation: a `@pyreon/lathe/vite` plugin regenerates on dev-server start and on every spec change, with `checkOnBuild` turning a stale client into a BUILD ERROR rather than a warning; plus `lathe generate --watch`. The watcher is on the containing DIRECTORY with a filename filter, because editors write via rename and a watch on the inode dies the first time one replaces the file; an unparseable mid-save spec prints and keeps watching rather than exiting',
    'Deterministic by construction: sorted models, sorted operations, sorted imports, no randomness in fixtures — an unchanged spec regenerates byte-identically, so a regeneration diff is reviewable',
    '`lathe check` is the CI half — regenerates in memory and fails when committed output has drifted from the spec, the same contract as `gen-docs --check`',
    'The HTTP runtime is SELECTABLE — `client: \'pyreon\' | \'fetch\' | \'axios\' | \'ky\'`. Only `client.ts` changes: every other emitted file reads an endpoint\'s callable / `.key` / `.query()` shape and nothing else, so endpoints, hooks, keys and the barrel are BYTE-IDENTICAL across all four. An adapter emits a self-contained endpoint factory over that library rather than wrapping `@pyreon/http`, so choosing axios means genuinely not depending on it',
    'Adapter URL and key semantics are pinned to `@pyreon/http` by a DIFFERENTIAL test that uses its own `buildUrl` as the ORACLE, over the shapes these libraries disagree on: a leading-slash path under a based URL (axios and ky RESOLVE, discarding the base\'s path; Pyreon PREFIXES), nullish query values, array values, and a path parameter containing `/`. A duplicated URL builder drifts, and drift there means the same generated call issues a different request depending on one config word',
    'Failure is normalised across adapters into one `LatheHttpError` carrying `status` and the parsed body — `fetch` resolves a 500, axios rejects with an `AxiosError`, ky with an `HTTPError`, and a generated query\'s `error` must not change shape when the transport is swapped. Retry policy is deliberately NOT normalised (ky retries 5xx GETs, the others do not) and is asserted rather than papered over',
    '`target: \'multiplatform\'` with a non-Pyreon client is REFUSED, not silently downgraded: PMTC lowers `createHttp` + `api.endpoint(...)` by NAME, so emitting native modules over axios would produce exactly the silent regression to web-only that the target exists to catch',
    'Mocks ride on `@pyreon/http`\'s own `mock()` middleware rather than MSW: no service worker, no extra install, identical in node and the browser. A parameterised route emits a bounded RegExp — the declared `/books/:id` is not a SUFFIX of the resolved `/v1/books/b1`, so a plain string matched nothing and every such fixture fell through to the real network. Adapter clients need no pattern at all: their seam is handed the declared path alongside the resolved one',
    'Atlas scenarios generated from the spec — one per enum value on a response field, so a variant axis the API declares is one the workbench actually exercises, and it regenerates when the API changes instead of drifting',
  ],
  longExample: `$ pyreon lathe generate ./openapi.yaml --target multiplatform

lathe / Bookshelf 1.2.0
  4 models  4 operations  target=multiplatform

  + src/gen/schemas.ts
  + src/gen/client.ts
  + src/gen/endpoints/books.ts
  + src/gen/queries/books.ts
  + src/gen/books.native.tsx

  5 file(s) written

  native reach  3/4 operations
    web-only 1 op(s): createBook
      POST lowers through mutations, which PMTC does not yet recognise.

  lowers books.native.tsx swift   [PyreonQuery< PyreonZodSchema_]
  lowers books.native.tsx kotlin  [PyreonQuery< PyreonZodSchema_]`,
  api: [
    {
      name: 'generate',
      kind: 'function',
      signature: 'generate(specText: string, config: ResolvedConfig): GenerateResult',
      summary:
        'The whole pipeline, pure: spec text in, file CONTENTS out. Touches no filesystem, which is what makes the generator testable without a temp directory and lets `lathe check` diff before writing. Returns the IR document, the generated files, and a per-operation `reach` map explaining in spec terms which operations can run natively and why the others cannot.',
      example: `import { generate, resolveConfig } from '@pyreon/lathe'

const config = resolveConfig({ input: './openapi.yaml', target: 'multiplatform' })
const { doc, files, reach } = generate(specText, config)

for (const [id, r] of reach) {
  if (r.reach === 'web-only') console.warn(id, r.reason)
}`,
      mistakes: [
        'Passing a relative `baseUrl` (or omitting `servers` from the spec) and expecting native output — PMTC bakes the request URL at compile time, so a relative base makes EVERY operation web-only. The reach report names this, but only if you read it.',
        'Assuming the `.native.tsx` modules replace the web output. They are ADDITIVE: the web files are byte-identical whether the target is `web` or `multiplatform`.',
        'Editing generated files. Every file carries a DO-NOT-EDIT banner and is overwritten on the next run; change the spec or the emitter.',
        'Expecting `s.enum` in native output. Enums do not lower, so the native path narrows them to `s.string()` — the constraint is genuinely lost there, which is why the two layouts are emitted separately rather than shared.',
      ],
    },
    {
      name: 'verifyNative',
      kind: 'function',
      signature:
        'verifyNative(files: GeneratedFile[], transform: TransformFn | undefined): VerifyReport',
      summary:
        'Runs the real native compiler over the generated `.native.tsx` modules on both targets and returns a per-file verdict. The check is POSITIVE — it asserts the emitted Swift/Kotlin contains `PyreonQuery<` / `PyreonZodSchema_` and contains no leaked web-only symbol — because zero warnings is not evidence: a standalone hook wrapping `useQuery` produces no warnings and emits Swift that cannot find the symbol. Passing `undefined` for `transform` yields `ran: false` with a reason, never a pass.',
      example: `import { generate, resolveConfig, resolveTransform, verifyNative, worstVerdict } from '@pyreon/lathe'

const { files } = generate(specText, resolveConfig({ input: 'spec', target: 'multiplatform' }))
const report = verifyNative(files, await resolveTransform())

if (!report.ran) console.warn('not verified:', report.reason)
if (worstVerdict(report) !== 'lowers') process.exitCode = 1`,
      mistakes: [
        'Reading `warnings.length === 0` as success. That is exactly the shape this function exists to catch — PMTC reproduces an unrecognised call verbatim and says nothing, so the native build fails later with "cannot find useQuery in scope".',
        'Treating `ran: false` as a pass. A verification that could not run is not one that ran and succeeded; `--strict-native` fails on it deliberately.',
        'Bundling a copy of `@pyreon/native-compiler` instead of resolving the project\'s. A verdict from a different compiler version than the one that will build the app is worse than no verdict.',
      ],
    },
    {
      name: 'loadOpenApi',
      kind: 'function',
      signature: 'loadOpenApi(source: string): { doc: IrDocument }',
      summary:
        'Parses an OpenAPI 3.x document (JSON or YAML text) into the spec-agnostic IR. Every reduction the IR cannot represent is recorded in `doc.notes` with a stable code and a location, so a loss is reported once at the boundary instead of being rediscovered differently by each emitter. Deterministic: models and operations are sorted, so the same spec always produces the same IR.',
      example: `import { loadOpenApi } from '@pyreon/lathe'

const { doc } = loadOpenApi(await readFile('./openapi.yaml', 'utf8'))
console.log(doc.models.length, 'models', doc.operations.length, 'operations')
for (const note of doc.notes) console.warn(note.code, note.at, note.message)`,
      mistakes: [
        'Ignoring `doc.notes`. A spec with a remote `$ref` or a non-JSON media type still produces output — with those pieces typed `unknown`. The note is the only signal.',
        'Expecting anchors or merge keys to work. The YAML reader refuses them by design with a line number, because silently ignoring an anchor produces a document that is wrong everywhere it was used.',
      ],
    },
  ],
})
