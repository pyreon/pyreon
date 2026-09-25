import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/lathe',
  title: 'Spec-to-Client Generator',
  tagline:
    'OpenAPI in, typed Pyreon client out — schemas, endpoints, queries, mocks, faker factories, Markdown reference and Atlas scenarios, with a multiplatform mode that proves its own output lowers to Swift and Kotlin',
  description:
    'Lathe reads an OpenAPI 3.x document and emits a client for the Pyreon stack: `@pyreon/validate` schemas, `@pyreon/http` endpoint declarations, `@pyreon/query` hooks, deterministic mock fixtures, and `@pyreon/atlas` scenarios derived from the spec\'s own enums and examples. YAML is read as YAML 1.2 core through the `yaml` package, configured strictly: anchors and merge keys resolve, while duplicate keys, multi-document streams, custom tags and non-JSON values are REFUSED with a line number rather than producing a document the author did not write. What separates it from a conventional generator is `target: \'multiplatform\'`: the native compiler (PMTC) lowers only a SUBSET of TypeScript and has no module graph, so it recognises a client, a schema and a call only when they share ONE file\'s top level. Hand-written code drifts out of that constantly; generated code need not, so Lathe emits a self-contained module per tag — a layout no human would maintain and exactly the one the compiler wants — then runs the real compiler over its own output and checks for the POSITIVE marker (`PyreonQuery<`, `PyreonZodSchema_`), because zero warnings is not evidence of lowering.',
  category: 'universal',
  multiplatform: {
    tier: 'web-only',
    rationale:
      'the code generator — build-time tooling that emits app code, not app runtime itself',
  },
  features: [
    'OpenAPI 3.x reader: JSON or YAML, local `$ref` resolution, `allOf` flattening through refs (the inheritance idiom), `oneOf`/`anyOf` with `discriminator` (validated at generation — an implicit or non-object discriminator degrades to a plain union with a note instead of a module that throws at import), nullability in every spelling (3.0 `nullable`, 3.1 `type: [X, null]` / `anyOf: [X, {type: null}]`) on every node including component models, `enum`/`const` of any JSON scalar, constraints on the type itself (so they apply to array items and alias models), path-level parameters, and `{id}` → `:id` conversion to the `@pyreon/http` endpoint form',
    'Strict YAML 1.2 reading via the `yaml` package — anchors, aliases and merge keys resolve; duplicate keys, multi-document streams, custom tags, recursive aliases and `.inf`/`.nan` are REFUSED with a line number rather than producing a subtly wrong document',
    'Loss is REPORTED, never silent: every spec feature the client does not honour becomes a `note` with a stable greppable `code`, an RFC 6901 JSON-pointer location, and a SEVERITY derived from the code (`NOTE_SEVERITY`) -- `loss` (security schemes, response headers, typed error bodies, non-default serialization, a non-scalar `const`, a `$ref` cycle through references alone, an optional body the call requires, a non-JSON media type, …) or `choice` (JSON over XML, the first tag). The report leads with losses and summarises choices; the reference pages split them',
    'Refuses the wrong document before writing anything: Swagger 2 with the `swagger2openapi` conversion command, a file with no `openapi` key, an unsupported major. Every project is generated before any is written, so a refused spec leaves every output tree untouched',
    'A strict CLI: unknown flags, commands and values are errors with a did-you-mean (exit 2), `--dry-run` reports what would change, the config is found upward from the cwd with paths relative to the config FILE, errors go to stderr, colour respects TTY/`NO_COLOR`, and `--json` has ONE documented shape (`JsonReport`) for any project count. `lathe pull` supports `--token` / `--header`, conditional requests via ETag, and every project with a `source`',
    'Orphaned output is pruned: each run writes `lathe-manifest.json`, and the next `generate` removes files it no longer produces while `check` reports them stale -- only manifest-listed paths are ever removed',
    '`target: \'multiplatform\'` emits an additional self-contained module per tag — client, schemas, endpoints and calls sharing one top level — because PMTC resolves nothing across file boundaries; the web output is unchanged, so enabling it can never make the web build worse',
    'The multiplatform claim is MEASURED: `verifyNative` runs the real `@pyreon/native-compiler` on both targets and asserts the positive marker plus the absence of leaked web-only symbols. A `does NOT compile` warning is treated as broken, not advisory, and an absent compiler SKIPS loudly rather than passing',
    'Per-operation native reach with a reason in spec terms: a mutation, a relative base URL, or a read with no typed JSON response (there is no declared type for a native query to decode into) is reported `web-only` by name instead of silently degrading. A path parameter becomes a PROP of the native data component and lowers',
    'Plugin selection is expanded along the IMPORT EDGES of the emitted code, not refused: `components` pulls in `queries` -> `client` -> `schemas` because `components.tsx` imports the hooks, and the report names what came along. Selecting a plugin without what its output imports previously produced files referencing modules that were never written - output that looks complete and does not resolve. `components` itself is independent of Atlas: the previews are ordinary Pyreon components over the generated hooks, so a project that wants them without a workbench gets exactly that',
    'Every emitter is opt-in via `plugins` (`types`/`schemas`/`client`/`queries`/`mocks`/`faker`/`components`/`atlas`/`docs`) — schemas alone is a first-class use, and `target` is ADDITIVE on top of the selection rather than a separate output, so asking for schemas gets schemas on both targets',
    'The output is a LAYERED graph, not one barrel: `index.ts` carries the production surface, `dev.ts` the fixtures/factories/previews, and `endpoints/index.ts` + `queries/index.ts` one layer each, so a consumer can take exactly the layer it needs. An emitted `package.json` declares the output side-effect-free (an ARRAY naming `atlas.wrapper.tsx`, which really does call `installMocks()` at module scope, rather than a blanket `false` that would be a lie) — and together with ONE SCHEMA MODULE PER MODEL (a `$ref` cycle shares one) and `/* @__PURE__ */` on every emitted call, one hook costs what it uses: measured with Vite 8 on GitHub\'s spec, one hook went from 94.4 KB to 2.8 KB gzipped of generated code, and the root barrel costs exactly what the per-tag import costs. Untagged operations are grouped by path (Stripe\'s single 612-endpoint `default` module became 79)',
    'Model TYPES are written out as interfaces and each schema const is cast to its schema (`export const Book = s.object({…}) as unknown as Schema<Book>`) instead of inferred, which cut the TypeScript cost of the generated schemas + client + queries by 26-65% on GitHub and Stripe (instantiations, deterministic). Interface/schema agreement is enforced by lathe\'s own tests, both ways, for every model. The trade: a generated schema is a `Schema<Book>`, so object-only builders (`.extend`, `.pick`) do not type-check on it',
    '`faker` emits one factory per model (`createBook(overrides?)`), and its rule is that a factory must produce data its OWN schema accepts: `min`/`max`/`pattern`/`enum` choose the generator and the field-name guess only applies where the spec states nothing. Depth is threaded explicitly so a recursive model terminates. `docs` renders Markdown with frontmatter — the generated HOOK name and its import site next to the HTTP contract, plus the one column a rendering of the spec cannot produce: whether the operation reaches iOS and Android, and when it does not, why',
    'Several specs in ONE pass via `projects: [{ name, input, output }]` — each to its own path (typically another package in the workspace, which is the intended use), with `target`/`plugins` written once at the top level and overridable per project. `lathe check` covers them all and fails if any is stale; a CLI `--out` alongside `projects` is REFUSED rather than applied to every one',
    'A generated `index.ts` barrel and a `keys.ts` query-key registry: one import site regardless of how operations were tagged, and invalidation keys derived from the endpoints rather than hand-written literals that drift the moment a path changes (`keys.books.listBooks.all` matches every call; `.of(args)` matches one)',
    'The Atlas story is FULLY generated: `components.tsx` emits one preview per SAFE READ — every `GET` with a JSON body, detail views with path parameters included (requested with the spec\'s example values, which the generated mocks answer), credential and session operations (login, logout, token, password) excluded — and renders the response by its SHAPE: a list of records as a table of the model\'s fields, one record as a description list, never a JSON dump; password/secret fields are not displayed. `force` (loading / error / empty), `args` and `data` are real props, so Atlas infers controls; `atlas.scenarios.ts` keys those names with Default, a seeded faker-built "Data" scenario, and the three forced states; `atlas.wrapper.tsx` installs the mocks so every card renders with NO server. Measured on the example with `atlas verify` + `atlas verify-browser`: 3 components, 15 scenarios, 0 failing, rendered in real Chromium',
    '`lathe init` sets a project up from what it already has: it detects an orval / @hey-api/openapi-ts / kubb config (read as TEXT, never imported or executed), an openapi-typescript script, or a bare `openapi.*` file; maps every option it can onto a `lathe` section and NAMES every one it cannot with what to do instead (an orval mutator becomes `configureApi({ use })`); writes `pyreon.config.ts` — creating it, or inserting one entry into an existing one, never replacing a `lathe` section already there; adds `lathe:generate` / `lathe:check` scripts; prints the install command for what the generated code imports; and runs the first generate. It asks only on a terminal; `--yes` takes every default for CI, `--dry-run` writes nothing, and it never writes into a directory holding another generator\'s files',
    'Generated JSDoc is written for the person hovering a symbol: the spec\'s summary AND description, one bullet per parameter with its location and meaning, `@deprecated` (operation, parameter, property, schema), a copyable `@example` built from the spec\'s own examples (else the same deterministic sample the mocks return), a `@see` link from `externalDocs`, and per-field docs on every model interface. One two-line header per file; no generator commentary',
    'Automation: a `@pyreon/lathe/vite` plugin that reads `pyreon.config.*` itself, generates ONCE at dev-server start and on every spec or config change, warns on a missing spec with a did-you-mean, and logs breaking contract changes and spec losses -- with `checkOnBuild` turning a stale client into a BUILD ERROR rather than a warning; plus `lathe generate --watch`, which watches the config too. The watcher is on the containing DIRECTORY with a filename filter, because editors write via rename and a watch on the inode dies the first time one replaces the file; an unparseable mid-save spec prints and keeps watching rather than exiting',
    'Deterministic by construction: sorted models, sorted operations, sorted imports, no randomness in fixtures — an unchanged spec regenerates byte-identically, so a regeneration diff is reviewable',
    '`lathe check` is the CI half — regenerates in memory and fails when committed output has drifted from the spec, the same contract as `gen-docs --check`',
    'The SCHEMA LIBRARY is selectable — `validator: \'pyreon\' | \'zod\'`. One walk with a different binding, not two renderers that can drift; both satisfy Standard Schema, so the endpoint layer accepts either without knowing. Every zod spelling was verified against the INSTALLED zod (4.4.3) rather than inferred: `z.string().email()` is deprecated there in favour of `z.email()`, and the deprecated form is emitted deliberately because it works in zod 3 AND 4 while the newer one exists only in 4',
    'MEASURED, and the opposite of what you would assume: on the native target PMTC\'s zod recogniser STRICTLY DOMINATES its first-party `s.*` one — a nested object and an array of objects lower under zod (via `@pyreon/validation`\'s `zodSchema(...)` wrapper) and are DROPPED under `s.*`. So `validator: \'zod\'` lowers strictly more of a real spec. Pinned by a test running the real compiler, so a PMTC change corrects the claim rather than leaving it stale',
    'A field NAMING another model — what every OpenAPI document of any size is full of — is dropped by both recognisers, and under zod that gap CLOSES: refs are inlined on the native path, and an inlined ref is a nested object. A `$ref` cycle falls back to naming the target (no finite nesting exists), so the compiler drops that one field with a warning and the generator stays bounded',
    'The HTTP runtime is SELECTABLE — `client: \'pyreon\' | \'fetch\' | \'axios\' | \'ky\'`. Only `client.ts` changes: every other emitted file reads an endpoint\'s callable / `.key` / `.query()` shape and nothing else, so endpoints, hooks, keys and the barrel are BYTE-IDENTICAL across all four. An adapter emits a self-contained endpoint factory over that library rather than wrapping `@pyreon/http`, so choosing axios means genuinely not depending on it',
    'Adapter URL and key semantics are pinned to `@pyreon/http` by a DIFFERENTIAL test that uses its own `buildUrl` as the ORACLE, over the shapes these libraries disagree on: a leading-slash path under a based URL (axios and ky RESOLVE, discarding the base\'s path; Pyreon PREFIXES), nullish query values, array values, and a path parameter containing `/`. A duplicated URL builder drifts, and drift there means the same generated call issues a different request depending on one config word',
    'Failure is normalised across adapters into one `LatheHttpError` carrying `status` and the parsed body — `fetch` resolves a 500, axios rejects with an `AxiosError`, ky with an `HTTPError`, and a generated query\'s `error` must not change shape when the transport is swapped. Retry policy is deliberately NOT normalised (ky retries 5xx GETs, the others do not) and is asserted rather than papered over',
    '`target: \'multiplatform\'` with a non-Pyreon client is REFUSED, not silently downgraded: PMTC lowers `createHttp` + `api.endpoint(...)` by NAME, so emitting native modules over axios would produce exactly the silent regression to web-only that the target exists to catch',
    'Mocks ride on `@pyreon/http`\'s own `mock()` middleware rather than MSW: no service worker, no extra install, identical in node and the browser. A parameterised route emits a bounded RegExp — the declared `/books/:id` is not a SUFFIX of the resolved `/v1/books/b1`, so a plain string matched nothing and every such fixture fell through to the real network. Adapter clients need no pattern at all: their seam is handed the declared path alongside the resolved one',
  ],
  longExample: `$ npx lathe generate ./openapi.yaml --target multiplatform

lathe / Bookshelf 1.2.0
  4 models  4 operations  target=multiplatform

  + src/gen/schemas/Book.ts
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
      signature: 'generate(specText: string, config: ResolvedConfig, options?: { sourceUrl?: string }): GenerateResult',
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
        'Expecting `s.enum` in native output. Enums do not lower, so the native path narrows them to their base scalar (`s.string()` / `s.number()`) — the constraint is genuinely lost there, which is why the two layouts are emitted separately rather than shared.',
      ],
    },
    {
      name: 'resolveConfig',
      kind: 'function',
      signature: 'resolveConfig(section: LatheSection | undefined): ResolvedConfig',
      summary:
        'Fills defaults and validates one project\'s settings, and is where the whole option surface lives: `plugins` (which emitters run), `client` (`pyreon` | `fetch` | `axios` | `ky`), `validator` (`pyreon` | `zod`), `target` (`web` | `multiplatform`), `baseUrl`, `strictNative` and `responseValidation` (`strict` | `warn` | `off`, what the web client does with a response that does not match its schema). A plugin selection is EXPANDED to cover what its output imports rather than refused -- asking for `components` gets `queries`, `client` and `schemas` too, and the CLI report says what came along. Use `resolveProjects` instead when the config may declare `projects: [...]`; it always returns a LIST, so a single-project config is a one-element list rather than a special case.',
      example: `import { generate, resolveConfig } from '@pyreon/lathe'

const config = resolveConfig({
  input: './openapi.yaml',
  output: './src/gen',
  // Nine emitters. Omit one and it does not run; schemas alone is a first-class use.
  plugins: ['schemas', 'client', 'queries', 'mocks', 'faker', 'docs'],
  client: 'pyreon',
  validator: 'zod',
})

const { files } = generate(specText, config)`,
      mistakes: [
        'Expecting `plugins: [\'faker\']` to emit ONLY factories. It expands to include `schemas`, because the factories exist to produce data the schema accepts and are typed against the model types it exports.',
        'Combining `target: \'multiplatform\'` with a non-Pyreon `client`. It is REFUSED, not downgraded: PMTC lowers `createHttp` and `api.endpoint(...)` by name and cannot see through axios or ky, so native modules over one would lower to nothing -- the exact silent regression that target exists to catch.',
        'Importing `installMocks`, `mockRoutes` or the faker factories from the generated `index.ts`. They are NOT there by design -- they live in `./dev`, so a page bundle has no import edge that could reach a fixture table or `@faker-js/faker`.',
        'Assuming `validator: \'pyreon\'` lowers more natively than `zod` because it is first-party. Measured against the real compiler it is the OPPOSITE: nested objects and arrays of objects lower under zod and are DROPPED under `s.*`, so `zod` is the better native choice for any spec with nested models.',
        'Setting `plugins` and expecting the generated `package.json` to change. The `sideEffects` marker is emitted unconditionally -- it is a statement ABOUT the output rather than a plugin\'s output -- and it names `./atlas.wrapper.tsx` only when `atlas` is selected, because that file alone has a module-scope side effect.',
      ],
    },
    {
      name: 'verifyNative',
      kind: 'function',
      signature:
        'verifyNative(files: GeneratedFile[], transform: TransformFn | undefined, compile?: NativeCompilers): VerifyReport',
      summary:
        'Runs the real native compiler over the generated `.native.tsx` modules on both targets and returns a per-file verdict. The check is POSITIVE — it asserts the emitted Swift/Kotlin contains `PyreonQuery<` / `PyreonZodSchema_` and contains no leaked web-only symbol — because zero warnings is not evidence: a standalone hook wrapping `useQuery` produces no warnings and emits Swift that cannot find the symbol. Passing `undefined` for `transform` yields `ran: false` with a reason, never a pass. Warnings are classified by CLASS per declaration (a verbatim reproduction is `broken`, a dropped field `partial`), identically for both targets; with `compile` (the project compiler\'s `validateSwiftWithStubs` / `validateKotlin`, as `resolveNativeCompiler()` returns them) each module is compiled too, and a compile error outranks every heuristic.',
      example: `import { generate, resolveConfig, resolveNativeCompiler, verifyNative, worstVerdict } from '@pyreon/lathe'

const { files } = generate(specText, resolveConfig({ input: 'spec', target: 'multiplatform' }))
const { transform, compile } = await resolveNativeCompiler()
const report = verifyNative(files, transform, compile)

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
      signature: 'loadOpenApi(source: string, options?: { sourceUrl?: string }): { doc: IrDocument }',
      summary:
        'Parses an OpenAPI 3.x document (JSON or YAML text) into the spec-agnostic IR. Every reduction the IR cannot represent is recorded in `doc.notes` with a stable code and a location, so a loss is reported once at the boundary instead of being rediscovered differently by each emitter. Deterministic: models and operations are sorted, so the same spec always produces the same IR. Pass `sourceUrl` (where the spec was fetched from) and a RELATIVE `servers[].url` is resolved against it, as OpenAPI specifies.',
      example: `import { loadOpenApi } from '@pyreon/lathe'

const { doc } = loadOpenApi(await readFile('./openapi.yaml', 'utf8'))
console.log(doc.models.length, 'models', doc.operations.length, 'operations')
for (const note of doc.notes) console.warn(note.code, note.at, note.message)`,
      mistakes: [
        'Ignoring `doc.notes`. A spec with a remote `$ref` or a non-JSON media type still produces output — with those pieces typed `unknown`. The note is the only signal. Filter on `noteSeverity(note) === \'loss\'` for the ones that change behaviour.',
        'Reading `op.body` as a type. It is `{ mediaType, encoding, type }` — `encoding` (`json` / `form` / `multipart` / `text` / `binary`) decides the call argument (`json:` / `form:` / `multipart:` / `body:`), and a form body carries its per-field `fieldEncoding`.',
        'Passing a Swagger 2 document. It is refused (`openApiVersionProblem` names the `swagger2openapi` conversion) rather than read as an empty 3.x spec.',
        'Expecting a custom YAML tag (`!Ref`, `!include`) to be expanded. The reader refuses it with a line number instead of reading it as a plain string; resolve or bundle the spec first. Anchors, aliases and merge keys DO resolve.',
      ],
    },
  ],
})
