# @pyreon/lathe

## 0.52.0

### Minor Changes

- [#3735](https://github.com/pyreon/pyreon/pull/3735) [`fc91492`](https://github.com/pyreon/pyreon/commit/fc91492c18cba19e38811486884eba76a46ef832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - An int64 id can be passed back as a parameter without converting it. `@pyreon/http` accepts a `bigint` for a path, query (scalar, array or object), header and cookie parameter and writes its exact decimal digits. A query key holding one now hashes: `endpoint.key()` / `endpoint.query()` / `toQueryOptions` store its digits, because `JSON.stringify` (and so `@pyreon/query`'s key hash) throws on a bigint, which used to make the whole query fail before it fetched.

  Under `int64: 'bigint'`, `@pyreon/lathe` types every int64 path / query / header / cookie parameter `bigint | number` (it was `string | number` for a path parameter and `string` for the rest). This covers the `pyreon`, `fetch`, `axios` and `ky` clients. The `fetch` / `axios` / `ky` runtimes widen their parameter types the same way and emit the same key normalisation. In default mode the output is unchanged.

  The `@pyreon/http` browser suite can now run in WebKit and Firefox as well as Chromium (`test:browser:engines`), and it compares every lossless-JSON layer an engine supports against the others.

- [#3105](https://github.com/pyreon/pyreon/pull/3105) [`dd61b84`](https://github.com/pyreon/pyreon/commit/dd61b846c47db27f38cc4dadda4a2534e674bed2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A generated query hook now derives `enabled` from its arguments, and the run report says what actually changed.

  **`args` may return `undefined` to mean "not ready".** The most common way to get a detail query wrong is to fire it before its id exists — and the natural workaround was to pass a placeholder id AND a matching `enabled` option, the same condition written twice, where getting the second one wrong requests `/books/` with an empty segment and 404s on first paint. The example's own call site carried exactly that, with a comment explaining it. Returning `undefined` now says it once:

  ```ts
  const detail = useGetBook(() => {
    const id = selected()
    return id === undefined ? undefined : { params: { bookId: id } }
  })
  ```

  The disabled branch keys on the endpoint's own `key.prefix`, so an invalidation still matches it. A caller's `enabled: false` still disables; a caller's `enabled: true` cannot fire a request whose path parameter is missing. The type widens (`Args` → `Args | undefined`), so existing call sites are unaffected.

  **The report distinguishes created / updated / unchanged.** It used to mark every file with a green `+` and then print "1 file(s) written" underneath — fourteen lines reading as "created" for one file that actually moved. Now `+` is new, `~` is updated, unchanged files are dimmed, and the count names its denominator.

- [#3713](https://github.com/pyreon/pyreon/pull/3713) [`9898029`](https://github.com/pyreon/pyreon/commit/98980295569c77ef2d1064eeb3e3fabda55041b5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Plugin hooks may be asynchronous. `setup`, `transformDocument` and `emit` may return a promise. The new `generateAsync()` awaits it; the CLI and the Vite plugin now run it. The pipeline is written once and driven either way, so the output is byte-identical. The determinism check still runs each hook twice, and the second call starts only after the first has settled. A rejection is attributed to the plugin and hook exactly like a throw. `generate()` stays synchronous and refuses a hook's promise, naming the plugin.

  `--plugins` on the CLI accepts third-party plugin modules: a path resolved from the working directory, or a package resolved through `node_modules` (honouring `exports` with the `import` condition). The module's default export may be a plugin, an array of plugins, or a function returning either. A name that is neither a built-in nor loadable is a usage error with a did-you-mean.

  `lathe init` detects orval and `@hey-api/openapi-ts` set up with no config file, from the flags in a `package.json` script. A script naming a config file (`--config` / `--file`) reads that file instead.

- [#3077](https://github.com/pyreon/pyreon/pull/3077) [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Make the Atlas story actually automated: previews, scenarios and a wrapper, all
  from the spec.

  The `atlas` plugin already emitted scenarios, but they were keyed by a native
  data component Atlas has no reason to scan, and varied RESPONSE fields rather
  than props. It produced a plausible-looking file that did nothing — the
  "generated but never wired" shape, and only running `atlas scan` against a real
  project surfaced it.

  Now:

  - **`components.tsx`** — one browsable preview per read operation. The variant
    axis is the DATA STATE (`loading` / `error` / `empty`), which is a real prop,
    so Atlas infers a control for it, and they are the three states a live
    request will not show you on demand.
  - **`atlas.wrapper.tsx`** — the `QueryClientProvider` the previews need, with
    the generated mocks installed, so every card renders with **no server**. Atlas
    names the missing provider precisely when there is none, so this is a step
    the generator can simply take.
  - **A transport seam on the generated client.** Endpoints bind at declaration
    time, so middleware cannot be added to `createHttp` afterwards — which a mock
    installed by a wrapper or a test never can be. One passthrough entry reserves
    the slot; `installMocks()` uses it.

  Measured on the bookshelf example: `atlas scan` discovers 2 components and 8
  scenarios, **8 verified, 0 failing** — and `atlas.config.ts` names no component,
  no scenario and no provider.

  **`@pyreon/atlas` gains `ignore`**, a list of path fragments added to the
  discovery defaults. A file can export a PascalCase component and still not
  belong in a catalog: generated code shaped for another compiler, an internal
  helper, an app entry point. Without it the only options were to browse it or
  rename it, and a card that throws on every scenario trains people to ignore the
  report.

- [#3120](https://github.com/pyreon/pyreon/pull/3120) [`3f29f0c`](https://github.com/pyreon/pyreon/commit/3f29f0c91c2f13de492b2ac06aff9d5e19ca196d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lathe's HTTP client is now selectable: `client: 'pyreon' | 'fetch' | 'axios' | 'ky'`.

  Only `client.ts` changes. Every other generated file — endpoints, hooks,
  `keys.ts`, the previews, the barrel — reads an endpoint's callable / `.key` /
  `.query()` shape and nothing else, so all four clients produce byte-identical
  output everywhere except the client itself and `mocks.ts`. Swapping is a
  one-word edit that leaves every call site alone.

  An adapter does not wrap `@pyreon/http`; it emits a self-contained endpoint
  factory into `client.ts`, so choosing axios means genuinely not depending on it.
  URL construction, query encoding, cache-key shape and error shape are matched to
  `@pyreon/http` exactly, held there by a differential test that uses its own
  `buildUrl` as the oracle over the shapes these libraries disagree on. Retry
  policy is deliberately not normalised — ky retries 5xx GETs and the others do
  not — and is asserted rather than papered over.

  `target: 'multiplatform'` with a non-Pyreon client is refused at config time
  rather than silently downgraded: PMTC lowers `createHttp` and `api.endpoint(...)`
  by name, so native modules over axios would lower to nothing.

  Two pre-existing mock bugs, both found by executing the generated output rather
  than asserting on its text:

  - A generated mock route for a parameterised operation never matched. The
    declared path (`/books/:id`) was emitted as a plain string, and `MockRoute`
    matches a string as a suffix of the resolved URL (`/v1/books/b1`) — so every
    such fixture fell through to the real network. It now emits a bounded RegExp.
  - A no-content operation emitted `json: null`, so the mock answered 200 with the
    body `null` while the real server answers 204 with nothing. `json` is now
    omitted, and the mock matches the server.

- [#3123](https://github.com/pyreon/pyreon/pull/3123) [`a22bb6d`](https://github.com/pyreon/pyreon/commit/a22bb6d217ed0fc8725ae0f53a1a2d74918c2827) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Composable output: layered entry points, a `sideEffects` marker, and two new plugins.

  **The output is a layered graph rather than one barrel.** `index.ts` carries the
  production surface; `dev.ts` carries fixtures, faker factories and preview
  components; `endpoints/index.ts` and `queries/index.ts` are one layer each. A
  barrel is a reachability edge, and a fixture table is DATA — so unlike an unused
  function it survives minification wherever it is reachable, and the flat barrel
  put every fixture in the page bundle.

  **An emitted `gen/package.json` declares the output side-effect-free**, which is
  what actually makes it tree-shake. A bundler keeps a module-level call unless it
  can prove the call is pure, and `api.endpoint(...)` and `s.object({ ... })` are
  both module-level calls. Measured with Vite 8 on a 30-tag / 120-operation spec,
  importing one hook: **30,710 B → 5,748 B** (2,420 → 642 gz), 120 fixtures → 0,
  and the barrel now costs exactly what a per-tag import costs. The declaration is
  an ARRAY naming `atlas.wrapper.tsx` whenever `atlas` is selected, because that
  file really does call `installMocks()` at module scope and a blanket `false`
  would be a lie a bundler would act on. `/* @__PURE__ */` per declaration was
  measured first and is nearly useless here (2,041 → 2,000 B, 2%): the arguments
  are themselves calls the bundler must still evaluate.

  Note the honest limit: an app whose own `package.json` already declared
  `sideEffects: false` was never affected — its declaration covered the generated
  files too. The marker means the result no longer depends on a field in a file
  the generator did not write.

  **`plugins: ['faker']`** emits one `createX(overrides?)` factory per model.
  Constraints outrank realism: `min`/`max`/`pattern`/`enum` choose the generator
  and the field-name guess only applies where the spec states nothing, so a
  factory produces data its own schema accepts. Recursive models terminate —
  depth is threaded through the builders rather than kept in module state.

  **`plugins: ['docs']`** renders Markdown reference pages with frontmatter, so
  they drop into a `@pyreon/zero-content` collection and still read on GitHub.
  They document the GENERATED client — the hook's name, its import site, and the
  one column a rendering of the spec cannot produce: whether the operation reaches
  iOS and Android, and when it does not, why. That comes from the same analysis
  the CLI prints, so page and terminal cannot disagree.

  **Breaking:** `index.ts` no longer re-exports `installMocks`, `mockRoutes`,
  `mockRouteTable` or the preview components. Import them from `./gen/dev`.

- [#3105](https://github.com/pyreon/pyreon/pull/3105) [`dd61b84`](https://github.com/pyreon/pyreon/commit/dd61b846c47db27f38cc4dadda4a2534e674bed2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lathe now detects breaking contract changes between spec revisions.

  A spec edit is the one change in this pipeline that can break an app without breaking a build. Delete a response field, regenerate, and everything still typechecks — against the new types, which agree with the new spec and with nothing the app was written for. The failure arrives at runtime, as a value that is suddenly `undefined`.

  Generation now writes `api-surface.json` beside the client: a compact record of what the run promised. The next run diffs against it and classifies every difference from the CLIENT's side, which is not symmetric with the server's — a response field removed or made optional is breaking, one added is not; a request parameter added as required is breaking, one removed is not.

  ```
  contract  2 breaking  1 additive
    ! [field-removed]      Book.pages   was integer
    ! [field-now-optional] Book.status  required → optional
    + [field-added]        Book.isbn    string (optional)
  ```

  `--fail-on-breaking` exits non-zero when any breaking change is present — opt-in, because on a feature branch the spec is supposed to move and a gate that fires there gets disabled rather than heeded. Every change carries a stable `code` so a script or an agent can branch on it, and `--json` carries the full list.

  A missing or wrong-version baseline reports nothing rather than every operation as added.

- [#3077](https://github.com/pyreon/pyreon/pull/3077) [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add a Vite plugin, watch mode, a generated barrel and a query-key registry.

  **`@pyreon/lathe/vite`** regenerates on dev-server start and on every spec
  change, so the window in which a client can disagree with its spec is the time
  between a save and the next request rather than however long it takes someone
  to remember to run the CLI. `checkOnBuild` makes a stale client a **build
  error** — generated output that disagrees with its spec compiles and then fails
  against the real server, which is the worst place to find out. It writes files
  to disk rather than serving a virtual module, deliberately: the one artifact
  people need to read when something looks wrong should be the one they can open.

  **`lathe generate --watch`** for the CLI. The watcher is on the containing
  directory with a filename filter rather than the file itself — editors write via
  rename as often as in place, and a watch on the inode dies the first time one
  replaces it. Events are coalesced, and a spec that is unparseable mid-save
  prints and keeps watching rather than exiting.

  **A generated `index.ts` barrel.** The per-tag split is an emitter concern;
  nothing in a consuming app needs to know which tag an operation was filed under,
  or that tags exist.

  **A generated `keys.ts`.** Invalidation is where a generated client usually
  stops helping: `['GET', '/books']` written by hand drifts from the endpoint the
  moment a path changes and nothing catches it. `keys.books.listBooks.all` matches
  every call of an endpoint, `.of(args)` matches one, and both come from the
  endpoint itself.

- [#3672](https://github.com/pyreon/pyreon/pull/3672) [`b976aa0`](https://github.com/pyreon/pyreon/commit/b976aa02bd47feceb8c3fe574edf676dc190ae37) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lathe's first hour, fixed.

  - **Output that compiles.** A GET with no content (Petstore 3's `logoutUser`) no longer emits `useQuery<void>` over an endpoint typed `unknown`, and no longer gets a native data component that PMTC cannot lower; Petstore 3 is now in the strict-typecheck matrix. A discriminated union whose tag cannot be proven (a `const` tag, an optional enum tag, a duplicated value) is emitted as a plain union with a note instead of throwing when `schemas.ts` is imported.
  - **The wrong document is refused.** Swagger 2 is refused with the `swagger2openapi` conversion command; a file that is not an OpenAPI 3.x spec is refused before any output is touched. Every project is generated before any is written. A numeric YAML `info.version` is kept instead of becoming `0.0.0`.
  - **Losses are loud.** Header and cookie parameters, security schemes, response headers, error bodies, other success responses, parameter serialization, `deprecated`, an optional request body, `const`, extra tags and a shadowed description all produce notes. Notes carry a severity (`loss` / `choice`, via `NOTE_SEVERITY` / `noteSeverity`); the report leads with losses; pointers are RFC 6901. A BROKEN native verdict's warnings print in full.
  - **Orphans are pruned.** `lathe-manifest.json` records what each run generated; `generate` removes what it no longer produces and `check` reports it stale. Commit the manifest.
  - **A strict CLI.** Unknown flags/commands/values are errors with a did-you-mean (exit 2); `--version`, `--config`, `--dry-run`, `--color`/`--no-color`; the config is found upward and its paths are relative to the config file; errors go to stderr; colour respects TTY and `NO_COLOR`. **Breaking:** `--json` now has one shape, `{ ok, command, projects: [...], error? }`, for any project count (a single project used to be a flat object).
  - **`lathe pull`** works without a config (`lathe pull <url> [dest]`), sends `--token` / `--header` / `$LATHE_TOKEN`, makes conditional requests via ETag, and pulls every project with the new `source` key.
  - **The Vite plugin** reads `pyreon.config.*` itself (`lathe({ checkOnBuild: true })` is enough), generates once at boot, warns on a missing spec with a suggestion, logs breaking changes and losses, and watches the config. `--watch` watches the config too.
  - `@pyreon/config`'s `LatheSection` now matches Lathe's own type exactly (`client`, `validator`, `source`, literal plugin names), enforced by a compile-time test.
  - `@pyreon/native-compiler`: schema drop warnings for the `s` DSL read `s declaration` instead of `null declaration`, and no longer cite `z.array()`.

- [#3735](https://github.com/pyreon/pyreon/pull/3735) [`fc91492`](https://github.com/pyreon/pyreon/commit/fc91492c18cba19e38811486884eba76a46ef832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `int64: 'bigint'` — OpenAPI `format: int64` without precision loss, end to end. The default (`'number'`) is unchanged and its output byte-identical; the `int64-precision` note now names the option.

  Under `'bigint'` an int64 field is a `bigint`: its schema widens a safe integer (`preprocess(…, bigint().min(1n))`, for `@pyreon/validate` and zod alike), every other number reads back a bigint as the double `JSON.parse` would have produced, and the client decodes and encodes JSON losslessly — `@pyreon/http/json` on the `pyreon` client, an emitted copy of the same codec on `fetch` / `axios` / `ky` (held identical by a differential test). Error bodies, SSE / NDJSON events, mock fixtures (bigint literals) and faker factories follow. The contract surface names the type `int64`, so an `int32` → `int64` change is reported as breaking.

  `responseValidation: 'off'` (for the client, or for an operation whose response carries an int64) is refused under `'bigint'` — validation is what widens a small id. Int64 path / query / header parameters travel as text. Web only: PMTC has no bigint, so the native modules keep the platform integer and a new `int64-native` note says so (Kotlin's `Int` is 32-bit). `@pyreon/config` gains the matching `lathe.int64` key; `@pyreon/mcp`'s API reference documents `losslessJson`.

- [#3687](https://github.com/pyreon/pyreon/pull/3687) [`181eac5`](https://github.com/pyreon/pyreon/commit/181eac590c765191c38838f93093fc19c5d08e92) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `lathe init` — set a project up from what it already has.

  Detects an orval, `@hey-api/openapi-ts` or kubb config (read as text, never
  imported or executed), an `openapi-typescript` script, or a bare `openapi.*`
  file; maps every option it can onto a `lathe` section and names every one it
  cannot, with what to do instead; writes `pyreon.config.ts` (creating it, or
  adding one entry to an existing one — an existing `lathe` section is never
  replaced); adds `lathe:generate` / `lathe:check` scripts; prints the install
  command for the packages the generated code imports; and runs the first
  generate. Questions are asked only on a terminal; `--yes` takes every default,
  `--from <tool>` skips detection, `--no-generate` stops after writing,
  `--dry-run` writes nothing, and `--json` reports one document. It never writes
  into a directory that holds another generator's files.

  `lathe pull` progress lines can now be routed (`PullOptions.out`), so
  `lathe init --json` keeps stdout a single JSON document.

- [#3687](https://github.com/pyreon/pyreon/pull/3687) [`181eac5`](https://github.com/pyreon/pyreon/commit/181eac590c765191c38838f93093fc19c5d08e92) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Readable generated documentation and Atlas previews v2.

  - Generated JSDoc now carries the operation's `description` as well as its
    summary, one bullet per parameter (location, optionality, description),
    `@deprecated` for deprecated operations, parameters, properties and schemas,
    a copyable `@example` built from the spec's own examples (else a
    deterministic sample — the same value the mocks return), and a `@see` link
    from `externalDocs`. Model interfaces carry per-field descriptions and
    examples. The `deprecated` and `description-dropped` notes are gone: both are
    honoured now.
  - Generated files lose their generator-maintainer commentary: one two-line
    header, and doc blocks written for the person hovering the symbol. The
    `keys.ts` and `faker.ts` examples name symbols from the spec being generated
    rather than a placeholder `books` API.
  - Previews cover every safe read: every `GET` with a JSON body, including
    detail views with path parameters (`getPetById`) and required query
    parameters, requested with the spec's example values. Login, logout, token
    and session operations are excluded, and so are password/secret fields in
    what a preview displays. A list of records renders as a table, one record as
    a description list; no more `<pre>` JSON dump. Previews take `args` and
    `data` props, and each gets a seeded "Data" scenario built from the faker
    factories (or the deterministic sample when `faker` is off).

- [#3105](https://github.com/pyreon/pyreon/pull/3105) [`dd61b84`](https://github.com/pyreon/pyreon/commit/dd61b846c47db27f38cc4dadda4a2534e674bed2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lathe now generates a native data component for an operation with a PATH PARAMETER, taking the parameter as a prop.

  `GET /books/{bookId}` previously produced no native component at all — lathe skipped any operation with a path param, because PMTC resolved the endpoint URL to a compile-time constant. The generated native surface therefore covered collection endpoints only, which is the less useful half of an API.

  PMTC now lowers a runtime `:param` through `useQuery`, whose native harness is keyed on the resulting URL and so re-fetches when the value changes. The emitted component takes the parameter as a prop and reads it as `props.x` — never a destructure, which would freeze the value and stop the query re-fetching.

  On the bookshelf example this takes native reach from 2/4 to 3/4 operations, with both generated modules verified `lowers` on Swift and Kotlin.

  Requires the PMTC change that makes a runtime path param lowerable; lathe's own verifier reports the components as `web-only` without it.

- [#3681](https://github.com/pyreon/pyreon/pull/3681) [`bcb04bd`](https://github.com/pyreon/pyreon/commit/bcb04bd844bd46bb8f30760e269f38746e911b5e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/lathe`: generated output that costs what you use.

  - One schema module per model (`schemas/<Model>.ts`, a `$ref` cycle sharing one; `schemas.ts` stays as the barrel) and `/* @__PURE__ */` on every emitted builder call and `api.endpoint(…)`. One GitHub hook: 94.4 KB -> 2.8 KB gzipped of generated code (Vite 8).
  - Model types are written out as interfaces and each schema is typed as `Schema<Model>` instead of inferred: 26-65% fewer TypeScript instantiations on GitHub/Stripe. **Breaking:** object-only builders (`.extend`, `.pick`) no longer type-check on a generated schema.
  - Query hooks take their data type from the endpoint, fixing 201 type errors on Stripe's generated queries and 38 on GitHub's.
  - Untagged operations are grouped by path instead of one `default` module.
  - New `responseValidation: 'strict' | 'warn' | 'off'` config option (also in `@pyreon/config`'s `LatheSection`).
  - Fixes: faker factories that did not parse (inline objects in arrays/unions) or typecheck (`overrides` on non-object models), a recursion notice that never fired, `types.ts` emitting `export interface X {…} | {…}`, a discriminated union over named models, cycle-through-union type errors, `format: uri` rejecting non-http URIs on `@pyreon/validate`, zod empty objects typed `Record<string, unknown>` against an inferred `Record<string, never>`, and dictionary factories spreading `Partial<Dict>`.
  - Faker generation is linear on cyclic graphs (Stripe 634 -> 144 ms CPU, a dense 2,000-model graph 40.6 s -> 0.1 s); the Vite plugin no longer generates twice on dev start; the CLI imports the native compiler only when a native module was generated.

- [#3684](https://github.com/pyreon/pyreon/pull/3684) [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/lathe`: a public plugin API and author control over the output.

  - `definePlugin({ name, requires?, setup?, transformDocument?, emit? })` — third-party emitters and IR transforms, listed in `plugins` beside the built-in names. Hook failures name the plugin and the hook; the document a hook receives is frozen (return a modified copy; a copy with dangling model references is refused); each hook runs twice and must agree with itself, so a plugin cannot break byte-identical regeneration; plugin files are listed in `lathe-manifest.json` (pruned when dropped), compared by `lathe check`, passed to `format`, and refused on a path collision. The IR types, the `SourceFile` writer and the identifier helpers are exported for plugin authors.
  - `filters` — generate a subset: `include` / `exclude` matchers by tag (every tag), path glob, operationId glob (spec id or generated name) and method. Unreached models and their notes are dropped (`models: 'all'` keeps them). A matcher that selects nothing is an error with a suggestion.
  - `patches` — RFC 6902 `add` / `replace` / `remove` at RFC 6901 pointers, applied before the spec is read. A patch whose target moved fails the run.
  - `operations` — per operation, keyed by endpoint name or spec `operationId`: `hook` (a name, or `false` for no hook, preview or native component), `responseValidation`, and `pagination` (the same entry the top-level `pagination` takes).
  - `naming` — `operation` / `model` / `file` / `hook` functions receiving Lathe's own choice as `default`; results are validated and collision-checked (file names case-insensitively). `hook` may return `false`.
  - `format` — `(code, path) => string | Promise<string>`, applied before a file is written and before `lathe check` (and the Vite plugin's `checkOnBuild`) compares. `formatFiles` is exported for programmatic use.
  - New note code `plugin` (severity `loss`) for losses a plugin reports through `ctx.note`.

  Behaviour changes: `runPass` from `@pyreon/lathe/vite` is now async (it may run an async formatter). With the `queries` plugin on, generated hook names are now checked for collisions (with each other, with endpoint names and with `@pyreon/query`'s exports) and a collision is an error naming both sides — previously it produced a module that did not compile.

  `@pyreon/http`: a per-request `validate` option and a per-endpoint `validate` in `api.endpoint(spec, { validate })` override the client's response-validation mode (static or accessor) for that request or endpoint.

  `@pyreon/config`: `LatheSection` gains `operations`, `filters`, `patches`, `naming` and `format`, and `plugins` accepts `definePlugin` plugins (`LathePluginObject`), kept in parity with `@pyreon/lathe` by its compile-time test.

- [#3077](https://github.com/pyreon/pyreon/pull/3077) [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add multi-project generation, and make the native layout follow the plugin
  selection.

  `lathe.projects: [{ name, input, output }]` runs several specs in one pass, each
  to its own output path — typically another package in the workspace, which is
  the intended use. `target` and `plugins` are written once at the top level and
  overridable per project. `lathe check` covers every project and fails if any is
  stale. A CLI `--out` or spec path alongside `projects` is REFUSED rather than
  applied to all of them: one path cannot address one project among many, and
  writing every client into a single directory is never what was meant.

  **Bug fix:** the native modules were emitted whenever `target` was
  `multiplatform`, ignoring `plugins` entirely — so `--plugins schemas` still
  produced a client and a data component. They are the `client`/`queries`
  emitters' native LAYOUT, not a separate output, and now follow the same
  selection.

- [#3105](https://github.com/pyreon/pyreon/pull/3105) [`dd61b84`](https://github.com/pyreon/pyreon/commit/dd61b846c47db27f38cc4dadda4a2534e674bed2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `lathe pull <url>` fetches a remote spec into the repo, and `bun run bench` measures the generator's scaling.

  **`pull` is a separate step on purpose.** The obvious design — let `input` be a URL and fetch during generation — makes output depend on a server's mood: two developers generate different clients from the same commit, `check` fails in CI for reasons nobody can reproduce, and an offline build stops working. So `pull` lands the spec on disk, you review the diff, and every later `generate` reads that file. The spec becomes a reviewable artifact rather than an invisible input — which is also what a contract diff needs, since it compares against a committed baseline.

  It parses before it writes: a 200 carrying an HTML error page or a login redirect leaves an existing working spec untouched, rather than turning a transient network problem into a committed one.

  **The bench answers a question that was previously unanswerable.** Lathe is LINEAR — a least-squares fit over four sizes and three dependency-graph shapes gives a `generate` exponent of 0.94–1.03 at R² 0.998–1.000 — and an 800-model / 1600-operation spec generates in ~25ms. The harness warms up, repeats, takes the median, reports inter-quartile spread, and refuses to state an exponent when the fit or the samples do not support one.

- [#3689](https://github.com/pyreon/pyreon/pull/3689) [`2a85027`](https://github.com/pyreon/pyreon/commit/2a85027c190335e782bd581b5856ae2ef783207d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `remoteRefs: 'fetch'` lets `generate` download the REMOTE parts of a spec on disk (default `'off'` stays offline and reports them), with `lathe pull`'s rules: per-document ETag cache, `remoteHeaders` keyed by origin and sent only there, and a part that cannot be fetched fails the run. A bundled `lathe pull` is now conditional on the root spec too. `api-surface.json` records typed error bodies and the contract diff classifies them (a removed key or changed body is breaking; an added key is breaking only when a range or `default` already covered its status). `mockOperation(id, { status })` answers with the declared, schema-valid error body.

- [#3680](https://github.com/pyreon/pyreon/pull/3680) [`f74c37c`](https://github.com/pyreon/pyreon/commit/f74c37cac8b162012b6bcb8494eef3bd5c3be85b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Spec correctness: lathe now opens and generates working clients for real-world specs.

  - **YAML is read by the `yaml` package** (YAML 1.2 core), configured strictly. The previous hand-written reader refused GitHub, Stripe, OpenAI, Twilio and DigitalOcean outright and silently corrupted block scalars, `\u` escapes and duplicate keys in the files it did open (31 of 57 micro-cases diverged). Anchors, aliases and merge keys now resolve; duplicate keys, multi-document streams, custom tags, recursive aliases and `.inf`/`.nan` are refused with a line number. A UTF-8 BOM is accepted on the JSON path too.
  - **Generated schemas no longer throw at import.** A discriminator whose tag is optional or not a fixed value (OpenAI's `Item`), or one over non-object members, degrades to a plain union with a note; a snake_case discriminator keeps its wire name; an enum is its own IR kind so string constraints no longer chain onto `s.enum(...)` (DigitalOcean); a dependency reached only through a nullable/array/union wrapper is emitted before its dependent (Twilio/OpenAI/DigitalOcean TDZ).
  - **Nullability is resolved on every node**: 3.0 `nullable` on component models, 3.1 `type: [X, 'null']` on models, and `{type: 'null'}` is real `null` (was `unknown`, which accepted anything). GitHub's own `components.examples` rejected for lathe-caused reasons (audit baseline → now): null 18 → 0 and URI 14 → 0 on 3.0, null 4 → 0 and URI 14 → 0 on 3.1.
  - `enum`/`const` of numbers, booleans and null; `format: uri` no longer uses the http-only `.url()`; 3.0 boolean and 3.1 numeric exclusive bounds; `multipleOf`; `minItems`/`maxItems`/`uniqueItems`; string/number constraints on array items and alias models.
  - IR: `IrType` gains `enum` and `nullable` kinds and per-kind constraints; `IrField.nullable`/`min`/`max`/`pattern` are gone (nullability and constraints live on the type).
  - **`$ref` / `allOf` cycles terminate.** A recursive pointer outside `#/components/schemas` (`#/$defs/Node`) is hoisted into a named model and closes through `lazy` like a component model; a cycle made only of refs is typed `unknown` with a `cyclic-ref` note; an `allOf` cycle contributes nothing from its cyclic part. Previously these overflowed the stack, or hung forever under Bun. Component models are now converted once (no duplicated notes through `allOf`), and JSON-pointer segments are percent-decoded.
  - **Names that normalize to one identifier stay distinct.** Models, operation ids, path placeholders and tag file names are assigned over the whole document: an exact spec name keeps itself, everything else takes the first free suffix (was: `User`, `User2`, `user` -> two `User2`s, so a `$ref` bound to the wrong schema). Tags differing only in case get separate files; a model named after a global the generated code references (`Record`, `Map`, `Promise`, …) is suffixed; `eval`/`arguments` are reserved. `generate()` refuses to emit two files with one (case-insensitive) path.
  - **Request media types are in the IR and on the wire.** `IrOperation.body` is now `{ mediaType, encoding, type, fieldEncoding? }` with encodings `json` / `form` / `multipart` / `text` / `binary`; `application/json; charset=…`, `*+json` and `*/*` count as JSON for bodies and responses. The generated client sends `form:` (with the spec's per-field `encoding` declared on the endpoint as `formEncoding`), `multipart:` (binary fields typed `Blob`), or a raw `body:` with its content type — Stripe's 611 form mutations and Twilio's 62 now send form bodies. The axios/ky/fetch runtimes gain byte-identical encoders (parity-tested against `@pyreon/http`).
  - **Header and cookie parameters** are typed (`IrOperation.headerParams` / `cookieParams`, `headers:` / `cookies:` call arguments); `Accept`/`Content-Type`/`Authorization` header parameters are ignored as OpenAPI requires. An operation-level parameter overrides a path-level one with the same name and location; an undeclared `{placeholder}` is synthesized as a required string; a parameter declared with `content` is read; a `2XX` response range is honoured.
  - **Composition and direction are represented, not dropped.** `allOf` merges `required` across parts, lets a later part narrow a field, distributes over a `oneOf` member, and keeps sibling `additionalProperties` (emitted as `.catchall(...)`); properties next to a `oneOf` apply to every member; `oneOf` + `anyOf` are both enforced; nullability of an `allOf` follows its parts. `readOnly`/`writeOnly` give each affected model a `<Name>Input` request shape. `types.ts` no longer emits an invalid `interface` for a nullable or index-signed model.
  - **Servers**: variables take their `default`; operation- and path-level `servers` travel with the operation (a separate literal-base client in native modules); a relative server URL is reported, resolved when `loadOpenApi`/`generate` get a `sourceUrl`, and `lathe pull` prints the absolute URL to configure.
  - **The API-surface diff catches what it missed.** `api-surface.json` is now `version: 2`: non-object models (enums, unions, arrays) are recorded under `aliases` with their members, and each model's `usage` (request / response / both) is recorded. New change codes `field-now-nullable`, `field-no-longer-nullable`, `member-removed`, `member-added`, `model-type-changed`, classified by direction (narrowing what the client sends is breaking; widening what it receives is breaking). Ordering no longer depends on the machine's locale. A version-1 baseline is reported as stale rather than diffed.
  - **A permanent real-spec gate**: excerpts of GitHub (3.0 + 3.1), OpenAI, DigitalOcean, Stripe, Twilio and Box plus the public Petstore/webhook examples are vendored; each must load (also after an 80-column YAML round-trip), generate with unique paths, import its `schemas.ts` under both validators, and validate the spec's own `components.examples` (with a verified allowlist of upstream example bugs that fails when an entry goes stale). `bun run corpus <dir>` runs the same over full-size specs.
  - **`$ref` siblings are honoured**: a constraining keyword next to a `$ref` (3.1 semantics, common in 3.0 specs too) merges with the target; annotation-only siblings keep the named reference.
  - **`int64-precision` note**: every `format: int64` number is reported in one aggregated loss note — `JSON.parse` rounds past 2^53 − 1 before validation runs, so no `bigint`/string mapping could recover the value; the field stays `number`.

- [#3689](https://github.com/pyreon/pyreon/pull/3689) [`2a85027`](https://github.com/pyreon/pyreon/commit/2a85027c190335e782bd581b5856ae2ef783207d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Reads more of the specs real APIs publish.

  - **Swagger 2.0** is up-converted to OpenAPI 3.0 in process (definitions, body and `formData` parameters, `produces` / `consumes`, `securityDefinitions`, `host` / `basePath` / `schemes`, `x-nullable`, `collectionFormat`, discriminators) instead of refused; what 3.0 cannot spell is a `swagger2-lossy` note. Swagger 1.x is still refused.
  - **Multi-file specs**: a `$ref` into another file is resolved against the spec's path and bundled — schemas become named models (stable names, cross-file cycles closed), everything else is inlined. `lathe pull` fetches and bundles a remote split spec, sending auth headers to the spec's origin only, with a per-document ETag cache. `--watch` and the Vite plugin regenerate on an edit to any referenced file.
  - **Typed error responses**: 4xx / 5xx / range / `default` JSON bodies are declared on each endpoint; hooks type `error()` as `EndpointError<typeof op>`, and `err.matched === '404'` narrows `err.body`. Works on every client. `error-responses` now fires only for untypable (non-JSON) error bodies.
  - **Webhooks and callbacks** are modelled (`IrDocument.webhooks`) and emitted as `webhooks.ts`: payload schemas plus `WebhookHandler<name>` types.

- [#3710](https://github.com/pyreon/pyreon/pull/3710) [`592c07b`](https://github.com/pyreon/pyreon/commit/592c07b848cb92cb1c0e5222b706f3c80c7c23ff) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lathe reads the spec constructs it used to leave behind. An `examples` entry that is a `$ref` (to `components.examples`, or to another file) is resolved before it becomes the `@example` and the preview argument; the bundler now treats an `examples` map as structure and only an example's `value` as data. A path item written as a `$ref` (3.1 `components.pathItems`, or shared between paths, webhooks and callbacks) is followed, with local fields winning. A `default` response with no 2xx beside it is carried through as the typed error body as well as the success type. A JSON spec's duplicate keys are reported (`duplicate-key`) with a pointer to each; `JSON.parse` still keeps the last, as every JSON reader does. A `trace` operation is reported (`unsupported-method`) rather than dropped silently: the Fetch standard forbids the method. Swagger 2: per-operation `schemes` that exclude the client's scheme become that operation's own servers on the document's host, and a query or form `collectionFormat: tsv` is carried as a new `tabDelimited` style.

  `@pyreon/http`: `QueryStyle` and `FormFieldEncoding` accept `tabDelimited`, which joins an array with a tab (Swagger 2's `collectionFormat: tsv`).

- [#3077](https://github.com/pyreon/pyreon/pull/3077) [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `@pyreon/lathe` — spec-to-client code generation for the Pyreon stack.

  Reads an OpenAPI 3.x document and emits `@pyreon/validate` schemas,
  `@pyreon/http` endpoints, `@pyreon/query` hooks, deterministic mock fixtures and
  `@pyreon/atlas` scenarios. Available as `pyreon lathe generate` alongside
  `pyreon atlas` and `pyreon loom`, and configured from a `lathe` section in
  `pyreon.config.*`.

  The `multiplatform` target is the part without a direct analogue elsewhere. The
  native compiler lowers only a subset of TypeScript and has no module graph — it
  recognises a client, a schema and a call only when they share one file's top
  level — so Lathe emits an additional self-contained module per tag, a layout no
  human would maintain and exactly the one the compiler wants. It then runs the
  real compiler over its own output and checks for the POSITIVE marker, because
  zero warnings is not evidence of lowering: a standalone hook wrapping `useQuery`
  produces no warnings and emits Swift that cannot find the symbol.

  Spec parsing is first-party, including a YAML reader scoped to the OpenAPI
  subset that refuses anchors, merge keys, explicit tags and tab indentation with
  a line number rather than mis-reading them.

- [#3688](https://github.com/pyreon/pyreon/pull/3688) [`c41314d`](https://github.com/pyreon/pyreon/commit/c41314da54f7217a4a63cd0d6ec07583fd431001) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Streams, contract diffs and MCP for generated API clients.

  - `@pyreon/http/stream` — Server-Sent Events and NDJSON over any transport: `openEventStream` / `openNdjsonStream` (typed, validated events; `Last-Event-ID` reconnection with backoff; cancellation that closes the socket; POST bodies and auth headers, which `EventSource` cannot send), the bare `readEventStream` / `readNdjson` parsers, and `streamHeaders`.
  - `@pyreon/query` — `useStream(source, options)`: any async-iterable stream as signals (`events` / `latest` / `status` / `error`, `abort` / `restart`), re-opened when a tracked input changes, aborted on unmount.
  - `@pyreon/lathe` — operations that stream (`text/event-stream`, NDJSON, or the new `streams` config) generate `<op>Stream` and `use<Op>Stream` for every client; `lathe diff <before> <after>` renders the client-contract diff of two specs, surfaces or git revisions as text, a Markdown PR comment, GitHub annotations or JSON, naming the generated symbols each change reaches; the new `mcp` plugin emits every operation as an MCP tool definition. `api-surface.json` now records each operation's stream, module, summary and generated symbols (non-diffed metadata). Fixes: `application/stream+json` was parsed as one JSON document; axios `responseType: 'stream'` returned a Node `Readable` (now uses axios's fetch adapter); the axios client emitted an unused `devResponse` (TS6133 under `noUnusedLocals`); a stream-only operation no longer gets a `useQuery` over a one-shot body.
  - `@pyreon/mcp` — `get_api_client`, `get_api_operation` and `explain_api_diff` serve the project's generated API client to assistants.
  - `@pyreon/config` — `lathe.streams` and the `mcp` plugin name.
  - Stream mocks: a generated mock for a streaming operation answers with a real SSE / NDJSON body (three fixture events with ids; an SSE mock resumes after `Last-Event-ID`), and an operation offering JSON and a stream is mocked by `Accept`. `@pyreon/http/mock` routes gain `accept` and a computed `body: (call) => string`.

- [#3120](https://github.com/pyreon/pyreon/pull/3120) [`3f29f0c`](https://github.com/pyreon/pyreon/commit/3f29f0c91c2f13de492b2ac06aff9d5e19ca196d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The schema library is selectable too: `validator: 'pyreon' | 'zod'` (and
  `--validator`). One walk with a different binding rather than two renderers that
  can drift; both satisfy Standard Schema, so the endpoint layer accepts either
  without knowing which was chosen, and `client` composes with it freely.

  Every zod spelling was verified against the installed zod (4.4.3) rather than
  inferred from its changelog. `z.string().email()` is deprecated there in favour
  of `z.email()`, and the deprecated form is emitted deliberately: it works in zod
  3 _and_ 4, while the newer one exists only in 4.

  **zod lowers strictly more of a real spec than the first-party validator.**
  Measured against the real native compiler: a nested object and an array of
  objects lower under zod (via `@pyreon/validation`'s `zodSchema(...)` wrapper) and
  are dropped under `s.*`. A field naming another model is dropped by both — and
  under zod that gap closes, because refs are inlined on the native path and an
  inlined ref is a nested object. So a spec whose `Book` has an `author: $ref`
  produces a Swift struct that keeps `author`, where the default validator emits it
  without that field. A `$ref` cycle falls back to naming the target; the compiler
  drops that one field and the generator stays bounded.

  The matrix is pinned by a test that runs the real compiler, so a change in PMTC
  corrects the claim rather than leaving it stale.

  ## Generated output is now typechecked for every client × validator pair

  The pyreon/pyreon combination had this coverage indirectly, through the
  bookshelf example. No other combination had any — the runtime tests execute
  through bun, which transpiles and does not typecheck. Running the real
  TypeScript compiler over all eight found five defects that were invisible
  otherwise:

  - **A `$ref` cycle produced schemas that did not typecheck at all** (TS7022), on
    _both_ validators. `lazy(() => X)` inside `const X = …` makes inferring X from
    its own initializer circular. Pre-existing; the example has no cycles. Cyclic
    models now name the structural type first and annotate the const.
  - **Every generated hook on an adapter client was typed `Promise<unknown>`.**
    The emitted `Infer` matched `{ types?: { output } }` directly, which fails
    silently against a library spelling it `types?: Types | undefined`.
  - The barrel exported `mockRoutes` unconditionally — a `@pyreon/http` middleware
    with no adapter equivalent — so a non-Pyreon client emitted an `index.ts` that
    did not compile. It also never exported `installMocks`, the one function the
    mocks plugin exists to provide.
  - The fetch adapter's `body` was not assignable to `RequestInit` under
    `exactOptionalPropertyTypes`.
  - The cyclic annotation declared a narrower enum type than `@pyreon/validate`
    actually infers, which is the declared-type-vs-runtime-schema drift that
    generating both from one walk exists to prevent.

- [#3719](https://github.com/pyreon/pyreon/pull/3719) [`cf780e1`](https://github.com/pyreon/pyreon/commit/cf780e15f31bc55119be29482a0adf706cae6c54) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `webhooks.ts` now carries the receiving side as well as types and schemas.

  - `validateWebhook(name, body)` runs a payload's schema on its own.
  - `webhookHandler(handlers, { verify, event })` is framework-agnostic: a `Request` or `{ request }` in, a `Response` out, so a zero API route can use it as-is. It verifies over the exact bytes received, parses the body by its declared media type, picks the event, checks the method, validates, and dispatches. It answers `401`, `400`, `404`, `405` (with `Allow`), `422` (with the issues) or `204`. Signature checking is a pluggable `verify` hook; no vendor scheme is guessed.
  - `callbackUrl(name, ctx)` / `expandCallbackUrl` / `evaluateRuntimeExpression` implement the full OpenAPI runtime-expression grammar for callback URLs: `$url`, `$method`, `$statusCode`, and `$request.` / `$response.` with `header.`, `query.`, `path.` and `body#/pointer`.

  Stream mocks can simulate a lost connection. `mockOperation(id, { dropAfter: n })` delivers `n` events per connection and then errors the body, so a GET SSE stream's reconnect and `Last-Event-ID` resume run against the mocks. The generated adapters' dev transport accepts a streamed body.

  `@pyreon/http`: a `MockRoute` `body` may be a `ReadableStream`, or a function that returns one. The stream is delivered as it is read and may error mid-body.

- [#3123](https://github.com/pyreon/pyreon/pull/3123) [`a22bb6d`](https://github.com/pyreon/pyreon/commit/a22bb6d217ed0fc8725ae0f53a1a2d74918c2827) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Generated docs front-matter now escapes the way YAML actually does, so a spec
  title carrying a quote no longer takes the page down.

  `yaml()` doubled the inner quote — the CSV and single-quoted-YAML convention.
  Inside a DOUBLE-quoted scalar YAML escapes with a backslash, so the doubled
  form closes the scalar and opens another: `title: """x"""` is not `"x"`, it is
  a parse error, and `gray-matter` (what `@pyreon/zero-content` actually reads
  these pages with) rejects the whole document. A backslash in the title had the
  same effect from the other direction, swallowing the closing quote. Both now
  escape correctly, backslash first for the reason `mdCell` already documents.

  The test that should have caught it asserted the broken spelling
  (`toContain('title: "He said ""hi"""')`) — it held the emitter to a string
  instead of to a contract, so it locked the bug in rather than finding it. It
  now PARSES the emitted page with `gray-matter` and round-trips the value,
  which is the same producer-vs-real-consumer discipline the adapter path
  constants follow. Quote, backslash and colon are each covered.

- [#3684](https://github.com/pyreon/pyreon/pull/3684) [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Generated-client correctness and DX pass:

  - Output order no longer depends on the host locale (`LC_ALL`): every emitted sort is by code unit, so the same spec regenerates byte-identically on every machine.
  - Entry points (`index.ts`, `dev.ts`) re-export only files that were actually emitted — a zero-model or zero-operation spec no longer imports `./schemas` / `./keys` / `./faker` that do not exist.
  - Operation ids and model names that collide with names the generated modules bind (`api`, `s`, `z`, `keys`, `query` → `useQuery`, `Record`, `Infer`, `Partial`, …) are suffixed (`apiOp`, `RecordModel`).
  - An operation-level parameter overrides a path-level one with the same `name` + `in`, as OpenAPI specifies.
  - Faker builders compile under `noUnusedParameters`.
  - A literal `:` in a spec path (`/v1/{name}:cancel`) is escaped, so custom-verb operations no longer demand a phantom parameter; mocks match them too.
  - Query parameters honour the spec's `style` / `explode` (CSV, space- and pipe-delimited arrays, `deepObject` and exploded `form` objects) through the endpoint's `queryStyle`, on every client; object query parameters now typecheck and no longer go out as `[object Object]`.
  - **Typed call sites.** Every endpoint is declared with its input type (`api.endpoint<Spec, V, Input>(…)`), so a DIRECT call — a loader, a server route, a script — is as strictly typed as a hook: path params, query (enum values included) and body are typed, required exactly where the spec says, and `exactOptionalPropertyTypes`-correct (`limit?: number | undefined`). An operation that sends nothing accepts no query or body. Hooks derive their types from the endpoint (`Parameters<typeof op>[0]`, `Awaited<ReturnType<typeof op>>`) instead of re-rendering the spec, which fixes hooks over inline enum responses failing to typecheck.
  - **Typed hook options.** Query hooks take `options?: () => Omit<UseQueryOptions<Data, Error, TData>, 'queryKey' | 'queryFn'>` with a `TData` generic, so a typo is an error and `select` changes the result type. Mutation hooks take typed `MutationOptions` and, by default, invalidate the queries at or below the mutated collection (`invalidates` overrides, `[]` turns it off). `keys.ts` exports `optimisticUpdate(client, endpoint, key, update)`, returning a rollback.
  - **Cache keys are namespaced** per generated client (`keyScope` — the project name, else the API's base URL), so two generated clients sharing one `QueryClient` no longer collide.
  - **Non-JSON responses** decode by media type — `text/*` and XML as text, `text/event-stream` / NDJSON as a stream, everything else as a `Blob` — instead of throwing `could not be read as JSON`.
  - `requestBody.required` is honoured (an unmarked body is optional), and a body on GET/HEAD — which `fetch` refuses to send — is dropped with a `body-on-get` note.
  - **Runtime configuration.** The generated client exports `configureApi({ baseUrl, headers, use, validate })` — each a separate slot read per request, so `installMocks()` no longer competes with auth middleware — and, per `components.securitySchemes` entry, a typed `auth.<scheme>(credential)` middleware (bearer / OAuth2 / OpenID Connect, basic, API key in header / query / cookie; a credential may be an accessor). The adapter clients (`fetch` / `axios` / `ky`) get the same `configureApi` — `use` in each library's own idiom (fetch middleware, axios request interceptor, ky `beforeRequest` hook) — and the same `auth.*` helpers; a differential test proves all four clients send identical requests.
  - The `responseValidation` config option (`'strict' | 'warn' | 'off'`) is the DEFAULT for `configureApi({ validate })`, which switches it at runtime, on every client.
  - **Mocks that work.** Every fixture satisfies its own generated schema — values are chosen constraints-first (enum, pattern via a deterministic, self-verifying sampler, length, range) and a spec `example` is used only when it conforms. Every `@pyreon/http` route is an anchored pattern matched against the base-relative URL, ordered most-specific first, so `GET /pets?limit=5` no longer escapes to the network, `/users/me` is not answered by `/users/{id}`, and a `configureApi({ baseUrl })` switch keeps matching. Non-JSON responses are mocked in their own media type. New per-test API in `mocks.ts` / `dev.ts`: `mockOperation(id, override)` (json / status / delay / error, returns a restore), `resetMocks()`, `mockCalls`.
  - **Honest native verdicts.** Compiler warnings are classified by what they say happened — a verbatim reproduction is `broken`, a dropped field makes the module `partial` (a new verdict), with a per-declaration list in the report — identically for both targets. When `swiftc` / `kotlinc` are available, `lathe` now also COMPILES each emitted module through `@pyreon/native-compiler`'s validators, and a compile error outranks every heuristic. Array / scalar / union models are inlined on the native path instead of being declared (PMTC synthesizes structs from object literals only).
  - Docs snippets import from the configured `output` (relative to `src/` when it lives there) instead of a hard-coded `./gen`, show an optional body as optional, and call a no-input mutation as `.mutate()`. Previews skip operations that need a request body.
  - **Infinite queries, declared.** A `pagination` config entry or an `x-pyreon-pagination` operation extension (`cursor` / `lastItem` / `offset` / `page`, with an optional `hasMore` path) emits a typed `use<Op>Infinite` hook and a pure `<op>InfiniteOptions` factory. Nothing is guessed; every declaration is checked against the spec's types, a wrong config entry fails the run, a wrong spec extension is noted (`invalid-pagination`).
  - On the `fetch` / `axios` / `ky` clients, mocks are installed BELOW the library (the injected fetch, a custom axios `adapter`, ky's `fetch` option) rather than ahead of it, so interceptors and auth see mocked requests; the adapter mock table uses the same anchored route patterns as the default client, gains `status` / `headers` / `body`, and exports `mockCalls`.

  - **Generated `<Op>Data` components re-render on the web.** Each one now returns `() => props.children(q.data())`. The direct call read the query once, at mount, so the component stayed at its loading render. The accessor form lowers natively once `@pyreon/native-compiler` has render-prop support.

- [#3740](https://github.com/pyreon/pyreon/pull/3740) [`ea12a88`](https://github.com/pyreon/pyreon/commit/ea12a887e736882b5019388ad0c61ba0d1e1490c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native streams behave like the web in three more places.

  - `@pyreon/http` native runtime (Kotlin): the stream loop reads on its own thread but no longer writes from it. Every state write (`events`, `latest`, `status`, `error`) and every `onEvent` call is handed to a main executor — the emit passes `PyreonStreamMain`, the Android main looper (new `PyreonStreamAndroid.kt`) — so `onEvent` code touching main-bound state behaves as it does on the web, where the whole hook runs on one thread. Each queued write re-checks that its stream is still the live one, so a write queued before `stop()` / `idle()` / `abort()` can no longer land after it. On Swift the loop already ran on the main actor; the loop parity test now asserts it.
  - `@pyreon/native-runtime-swift` / `@pyreon/native-runtime-kotlin`: `PyreonJSON.stringify` / `PyreonJson.stringify` write exactly the bytes the web's `JSON.stringify` writes for the same value — keys in source order (Swift's `JSONEncoder` did not keep it), numbers laid out by ECMAScript's `Number::toString` (`1`, not `1.0`; `1e+21`; `-0` → `0`; `NaN` → `null`), and strings escaped as `JSON.stringify` escapes them (no `\/`).
  - `@pyreon/native-compiler`: `JSON.stringify(x)` lowers to those, so a stream's runtime `json` body (and every other stringified value) is byte-identical across web, iOS and Android. The Kotlin `useStream` emit passes `main = PyreonStreamMain`.
  - `@pyreon/lathe`: a stream-only non-GET operation with a JSON body (or none) now reaches native as a TRIGGERED `<Op>Stream` component — `enabled: boolean` opens the stream while true, the body is the `json` prop — the `useStream(src, { enabled })` + runtime `json` shape the native compiler lowers. A form / multipart / text / binary body, or a path parameter named `enabled` / `json` / `children`, stays web and the reach report says which.
  - `@pyreon/query`: the `useStream` manifest entry records the main-thread `onEvent` and the byte-identical body.

- [#3720](https://github.com/pyreon/pyreon/pull/3720) [`45a04fb`](https://github.com/pyreon/pyreon/commit/45a04fb6e95af5b6d0dad9d3e76d5d756a218f02) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Streaming operations now reach iOS and Android.

  - `@pyreon/http` ships a co-located native stream runtime (`native/swift/PyreonStream.swift`, `native/kotlin/.../PyreonStream.kt`, declared in `pyreon.native`): SSE and NDJSON parsers that agree with `@pyreon/http/stream` byte-for-byte, and a `useStream` container with the web's reconnect semantics — exponential backoff, a server `retry:` replacing the base delay, `Last-Event-ID` on every reconnect, 408/429/5xx/network retried and other 4xx / decode failures final — cancelled when the view goes away. Kotlin uses the JDK's `HttpURLConnection` (no new dependency); Swift uses `URLSession.bytes(for:)` over raw bytes, because `AsyncBytes.lines` drops the empty lines that dispatch SSE events.
  - `@pyreon/http/stream` web fix: the line reader stripped TWO leading BOMs (the `TextDecoder` consumed one, the reader another) where the spec strips one, and an empty chunk between the CR and LF of one CRLF reset the pending-CR state, so the LF read as a blank line and split one SSE event into two. Both found by the new cross-platform differential test.
  - `@pyreon/native-compiler` lowers `useStream<SseEvent<T>>((ctx) => openEventStream((c) => endpoint({ …, signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }))` (and `openNdjsonStream` + `useStream<T>`) over a same-file endpoint to that runtime on both targets — keyed on the request URL and a restart tick, so a runtime `:param` reopens the stream and `restart()` works. `events`, `lastEventId`, `reconnect`, `data: 'text'`, `maxEvents` and a non-default `accept` lower; `parse` is ignored with a named warning; `enabled` / `onEvent` keep the stream web. A `responseType: 'stream'` endpoint consumed by `useFetch` / `useQuery` is now refused by name instead of lowering to a JSON decode of a byte stream.
  - `@pyreon/lathe`: a stream-only `GET` with a typed event (or SSE read as text) gets a `<Op>Stream` component in its tag's native module, and the reach report names it `web+native` (the report and the emitter ask one predicate). An untyped stream stays `web-only` and says which event type is missing. The verifier recognises the `PyreonStream<` marker, and a stream-only tag module no longer imports an unused validator binding (which PMTC warned on by name).

  Known limit, disclosed: URLSession reports a chunked body cut off by a graceful close as a clean end, where `fetch` and `HttpURLConnection` report an error. The Swift runtime reads an event left half-built at EOF as a dropped connection; a cut landing exactly on an event boundary still reads as a clean end on iOS.

### Patch Changes

- [#3602](https://github.com/pyreon/pyreon/pull/3602) [`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The repo's contributor rules moved from `.claude/rules/` to `.agents/rules/`, and the agent instructions from `CLAUDE.md` to `AGENTS.md`, so they work with any coding agent. Tools that read those files now look in the new places: the MCP `get_anti_patterns` and `get_browser_smoke_status` tools, the lint rule `pyreon/require-browser-smoke-test`, and the `pyreon doctor` doc-claims gate. Messages and comments that pointed at the old paths are updated.

  The six `@pyreon/native-*` packages no longer describe themselves on npm as "PRIVATE / EXPERIMENTAL" or "Not published"; they are published, and their descriptions now say what each one is.

  `@pyreon/mcp`: `get_content_collection` and `get_content_entry` were registered and callable but missing from the manifest, so `mcp_overview` and the API reference did not list them. They are listed now, and `check-mcp-docs` fails when a registered tool and the manifest disagree in either direction.

- [#3428](https://github.com/pyreon/pyreon/pull/3428) [`7afa39c`](https://github.com/pyreon/pyreon/commit/7afa39c748f332c9717b76aa602c0685824d9cb9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - chore(deps): clear five known advisories that were fixable within existing ranges

  `bun audit` reported 7 advisories (4 high, 3 moderate) reachable from published
  packages. Five are patch bumps inside the ranges already declared, so this is a
  lockfile-only change:

  - `js-yaml` 3.15.1 -> 3.15.2 and 4.3.1 -> 4.3.2 (2 high — `maxTotalMergeKeys`
    does not limit CPU use for empty merge sources). Reached via
    `@pyreon/lathe > gray-matter`, and via `@changesets/cli` on the dev side.
  - `hono` 4.13.0 + 4.13.5 -> 4.13.7 (3 moderate — `toSSG()` path traversal,
    unbounded `parseBody()` nesting, query-parser cache-key differential).
    Reached via `@pyreon/mcp > @modelcontextprotocol/sdk > @hono/node-server`.

  Two remain and are NOT fixable this way: `image-size` (2 high, DoS via infinite
  loops in the ICNS and JXL/HEIF parsers) is fixed only above 2.0.2, and
  `pptxgenjs@4.0.1` pins `^1.2.1`. Forcing it with an override would break that
  declared range. Exposure is limited — `pptxgenjs` is an OPTIONAL peer of
  `@pyreon/document`, so only consumers who opt into pptx export resolve it at all.

- [#3192](https://github.com/pyreon/pyreon/pull/3192) [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Three defects found auditing the changes since 0.51.0.

  **`safeRedirectLocation` failed open to an open redirect and to `javascript:`
  XSS.** The guard classified the RAW target while a browser classifies a
  PREPROCESSED one, and the gap is one character wide. The WHATWG URL parser
  strips leading/trailing C0 controls and space, and removes ALL ASCII tab and
  newline from anywhere in the input; `String.prototype.trim()` covers the first
  only partially and the second not at all, because that character sits in the
  middle. So `"/<TAB>/evil.example"` was classified `internal` and resolves to
  `https://evil.example/`, and `"java<TAB>script:alert(1)"` was classified
  `internal` and resolves to a live `javascript:` URL — both verified against the
  platform's own URL parser, which is the oracle the regression test uses. The
  `internal` branch also returned the ORIGINAL string rather than the one it had
  inspected, so even a correct verdict handed back bytes that produce a different
  one. The target is now normalised the way the parser does, before classifying,
  and the normalised value is what ships.

  **`@pyreon/lathe`'s YAML reader replaced an object's prototype instead of
  setting a key.** Both mapping paths assigned `map[key] = value`, and for
  `__proto__` that runs the inherited accessor: the key vanishes from the parsed
  document while its value's properties leak into every later member read on that
  object. A spec reaches this parser over the network — `lathe pull <url>` fetches
  one and writes it to disk — and the IR it produces is what the emitters turn
  into source, so a silently-dropped field is a missing field in a generated
  client and a silently-added one is a generator input nobody wrote. The `.json`
  half of the same reader was always correct, because `JSON.parse` defines the
  property rather than assigning it; the two formats disagreed about the same
  document. Fixed by doing what `JSON.parse` does.

  **The three file pickers leaked their `<input>` when neither `change` nor
  `cancel` fired.** `useCamera` / `useFilePicker` / `useImagePicker` each appended
  a hidden input to `document.body` and removed it inside `settle`, under a
  comment promising that "a browser that fires neither event must not leak the
  node". The `settled` flag cannot provide that: with no event `settle` never
  runs, so neither does `input.remove()`, and the document then holds the node,
  its listeners and the `resolve` closure for the life of the page — once per
  pick, unbounded. `cancel` is the event that would have fired, and the same
  comments describe it as "not universal across older browsers". The three
  implementations were byte-identical and are now one helper, whose `onCleanup`
  settles any pick still open when the component unmounts.

- [#3669](https://github.com/pyreon/pyreon/pull/3669) [`c95ea09`](https://github.com/pyreon/pyreon/commit/c95ea0941a5a09cd9b14e817b09c857ce64b1112) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Docs/manifest accuracy pass over the ui-system and tools packages — no runtime changes.

  - `@pyreon/ui-core`: manifest grew from 6 to 18 `api[]` entries, now covering every real export — `init`, the descriptor-safe `get`/`set`/`merge`/`pick`/`omit`/`isEmpty`/`isEqual` utilities, `throttle`, `compose`, `resolveSlot`, `isPyreonComponent`, `render`, `useStableValue`, `HTML_TAGS`/`HTML_TEXT_TAGS`, the `getThemeEngine`/`setThemeEngine` theme-engine registration seam, and `resolveCssVariables`. The deprecated internal `Provider`/`context` are now called out in `gotchas`.
  - `@pyreon/unistyle`: manifest grew from 11 to 14 entries — added `values`, and the Custom-Property Style Extraction (CPSE) primitives (`cpseRewrite`/`cpseVarName`/`extractStyleVar`, `cpseStyled`) that were previously undocumented despite backing the `styleExtraction: true` opt-in.
  - `@pyreon/atlas`: added `atlas init`, `atlas check`, and `defineAtlas` manifest entries — three real CLI/API surfaces that had zero documentation on the manifest or the docs site. Corrected `defineAtlas`'s description: it types `createAtlas()`'s programmatic options, not the wider `atlas.config.ts` file convention (a real, easy-to-hit type mismatch if conflated).
  - `@pyreon/lathe`: added `resolveProjects`, `resolveTransform`, and `worstVerdict` manifest entries (referenced in existing examples but previously undocumented).
  - `@pyreon/lint`: added the `lintAsync` manifest entry (the worker-pool sibling of `lint()`, used by the CLI itself for large runs).
  - `@pyreon/loom`: added the `loom build` manifest entry — a real, shipped CLI command (static-site export of the observatory) that was missing from both the manifest and the docs site.

  Docs-site fixes:

  - `docs/elements.md`: documented the previously-unexplained `contentDirection`/`contentAlignX`/`contentAlignY` trio (governs a SIMPLE Element's layout, default `'rows'`) and the per-slot `beforeContentDirection`/`afterContentDirection` trio, and clarified that the existing `direction`/`alignX`/`alignY` props only apply once `beforeContent`/`afterContent` make an Element compound — passing `direction` alone on a simple Element was silently a no-op with no explanation anywhere in the docs.
  - `docs/ui-core.md`: added the theme-engine registration seam section (`getThemeEngine`/`setThemeEngine`) and fixed a broken internal anchor link.
  - `docs/atlas.md`: added `atlas init` and `atlas check` sections — both real, documented-in-`--help` commands with zero prior coverage; renamed the stale "The four commands" heading (five sub-sections were already documented, plus two more added here).
  - `docs/loom.md`: added the `loom build` section.
  - `docs/lathe.md`: added the `lathe pull` section and a full CLI flags reference (`--target`, `--base-url`, `--client`, `--validator`, `--strict-native`, `--fail-on-breaking`, `--watch`), none of which were previously documented on the docs site despite being real, shipped flags.

- [#3392](https://github.com/pyreon/pyreon/pull/3392) [`e5567e3`](https://github.com/pyreon/pyreon/commit/e5567e3bf20fbf8d12e04a61747863a4a4e01fa2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Three confirmed pre-release defects in the tools layer, each a case of a guard
  that recognised one SHAPE of its class and stopped there.

  **`@pyreon/lathe` — a `pattern` carrying a line terminator killed the whole
  generated schemas module.** `portableRegex` refused a `pattern` containing `/`,
  and its own comment says why: the emit writes `/${pattern}/`, so an
  unescaped `/` ends the literal. A regex literal is ALSO ended by all four
  JavaScript line terminators — `RegularExpressionChar` is built from
  `RegularExpressionNonTerminator`, "SourceCharacter but not LineTerminator", so
  LF, CR, U+2028 and U+2029 are illegal anywhere in one, character class
  included. `{"pattern": "a\nb"}` is legal OpenAPI, so this needed no bad faith
  to reach, and the damage is not a dropped constraint: `.regex(/a<LF>b/)` is
  `Unterminated regular expression literal '/a'`, which takes every model in
  `schemas.ts` with it — one spec field is a build-time failure for the whole
  generated client. All four are now refused alongside `/`. A raw CONTROL
  character is NOT a terminator and stays legal, which is the discriminating case
  and has its own spec, so the guard cannot quietly widen into "anything unusual".

  This is the FIFTH lexical context a spec-controlled string reaches in this
  package, after the line comment, the block comment, the string literal and the
  JSON literal — the other four already handle line terminators
  (`safeLineComment`, `q`, `jsonLiteral`), and the regex literal simply never
  joined them. The `injection.test.ts` suite gains it as a fifth context and keeps
  that file's discipline: the spec EXECUTES the emitted module, because
  arbitrary-code injection is not reachable through a regex literal while `/`
  stays refused, so "does this still parse" is the assertion that catches it and a
  string-level check is not.

  **`@pyreon/lint` — `no-query-selector-cast-in-test` missed three ordinary
  shapes.** Measured firing ZERO times on each, against a rule configured `error`:

  ```ts
  c?.querySelector('a') as HTMLAnchorElement // ChainExpression
  el.querySelector('x') as HTMLElement & { _x } // TSIntersectionType
  el.querySelectorAll('x') as NodeListOf<HTMLDivElement>
  ```

  The third is the sharpest: the rule's own docblock advertised `queryAll` for
  `querySelectorAll` while the callee test only ever accepted `querySelector`, so
  the advice named a case the matcher could not see. The guard listed two AST
  node types over a bare `MemberExpression` callee; the class is "a
  `querySelector` / `querySelectorAll` call, HOWEVER REACHED, cast to a type that
  MENTIONS an HTML element type". It now peels the wrappers that can sit between
  a cast and its call (`ChainExpression`, a second `as`, `!`) and WALKS the
  annotation (union, intersection, parenthesised, array, and type ARGUMENTS,
  which is where `NodeListOf<…>` hides the element type), so a spelling nobody
  has written yet is covered by construction. The angle-bracket cast
  (`<HTMLY>expr`) is the same defect and is handled too. Eleven real sites in the
  repo were reporting nothing and are now fixed with the typed helpers.

  **`@pyreon/lint` — `no-require-in-esm` flagged the escape hatch it recommends,
  and never looked at test files.** `const require = createRequire(import.meta.url)`
  is the one legitimate way to load a CJS-only artifact (a napi `.node` addon, a
  built CJS bundle) from an ES module, and the rule's shadow detection covered a
  parameter and an import but not a variable binding — so `vite-plugin`'s
  `plain-build.test.ts`, already correct and with a comment saying why, read as a
  finding. The binding is now counted like a parameter: released when its
  enclosing function exits, file-wide at module scope, so one `createRequire`
  cannot mute the rule for the file.

  Separately, the rule declared no `scanTarget` and therefore got the `source`
  default — but a `.test.ts` in a `"type": "module"` package throws
  `require is not defined` under real Node exactly as `src/` does. This repo was
  carrying 47 such calls across ten test files, all green, because bun defines
  `require` in ESM, which is this rule's entire premise. `RuleMeta.scanTarget`
  now accepts a LIST and the rule declares `['source', 'test']`. Resolve it
  through the new `scanTargetsOf` / `targetsScan` helpers rather than comparing
  with `===`, which silently matches nothing against a list — the same shape of
  silent hole the field exists to close.

  **`@pyreon/cli` — the doctor lint gate's extra `scanTarget` passes evaporated
  silently.** The PRIMARY scan already refuses to read an empty file list as a
  clean pass (`emptyScanResult` skips loudly, because a gate that inspected
  nothing must not score like one that inspected everything). The two
  `scanTarget` passes were added beside that guard and `continue`d on an empty
  match, so a pass that reached zero files left the gate green while every rule
  it exists to run reported nothing — the same class as its own neighbour's
  comment, one level down. An empty extra pass is now a `warning` finding that
  names the rules which did not run and cannot have passed.

  ***

  **One budget moved, and it is a gate finding rather than a size change.**
  `@pyreon/lint`'s bundle budget was **512 bytes** — for a linter shipping 513 KB
  of built chunks. `check-bundle-budgets` builds the main entry with
  `splitting: true` and measures only the entry OUTPUT; `lib/index.js` was a pure
  re-export barrel over `_chunks/`, the package declares `sideEffects: false`, and
  nothing inside the bundle consumes those exports — so Bun tree-shook the entire
  package away and the gate measured a **730-byte empty bundle**. It was not
  measuring `@pyreon/lint` at all.

  Exporting `scanTargetsOf` / `targetsScan` puts a live declaration in the entry,
  which defeats the drop-everything outcome and reveals the real figure: 65,807
  bytes gzipped. The budget is bumped BY HAND to 67,840 (+3.1%, above the measured
  local-vs-CI gzip delta) — never `--update`, which would rewrite all 71 entries
  from this machine.

  **The shipped bytes did not change.** Both `_chunks/` files are byte-identical
  across the change (content-addressed names unchanged: `cli-DAVSZa6Z.js` 68,485 B
  and `runner-B-C7XePv.js` 440,848 B), and the built barrel is 2,214 B either way.
  A consumer importing `{ lint }` gets exactly what they got before.

  Two sibling packages have the same shape and are still measuring empty bundles:
  `@pyreon/charts` (256 B budget, 570 KB of lib) and `@pyreon/lathe` (512 B, 170 KB).
  Making the gate REFUSE a near-empty measurement is the right fix and is the same
  class as the doctor change above — but it requires honest re-baselines for both,
  so it is called out here as an immediate follow-up rather than folded in.

- [#3434](https://github.com/pyreon/pyreon/pull/3434) [`e2521d6`](https://github.com/pyreon/pyreon/commit/e2521d627d6d14aefc571541f376df1699552ee6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(lathe): a spec description could inject executable code into every generated file

  `safeBlockComment` broke the `*/` terminator FIRST and stripped control
  characters SECOND, so a control character sitting between the `*` and the `/`
  hid the terminator from `split` — and the strip then re-joined it:

  ```
  in   A book *<NUL>/ globalThis.PWNED = 1; /*
  out  A book */ globalThis.PWNED = 1; /*

  /** A book */ globalThis.PWNED = 1; /* */
  export const Book = 1
  ```

  That is valid JavaScript with an injected statement at code position, in every
  generated file, executing on import — and because the output parses, nothing
  downstream flags it. Reachable from an OpenAPI `summary` or `description`.

  The order is now removal-before-break, which is the general form of the repo's
  "escape the escape character first" rule: a step that REMOVES characters must
  precede a step that BREAKS a multi-character terminator. `safeLineComment`
  already had these two in the correct order.

  The regression test runs the emitted block rather than inspecting it — a
  string assertion passes on output that merely looks right.

- [#3077](https://github.com/pyreon/pyreon/pull/3077) [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix two defects in generated schemas, and remove a quadratic from the emitter.

  **Declaration order was a correctness bug, not a formatting one.** Schemas are
  `const` declarations and `const` is not hoisted, so a model emitted before one
  it references threw `ReferenceError: Cannot access 'X' before initialization`
  the moment the module was imported. Models were emitted alphabetically, which
  satisfies that only by coincidence — `Alpha` referencing `Zulu` produced a
  `schemas.ts` that crashed on import. They are now emitted in dependency order,
  and a genuine `$ref` cycle (a tree node with children, a comment with replies)
  is broken with `s.lazy(() => X)` rather than being emitted unorderable.

  **Native modules inlined only directly-referenced models.** A native module
  imports nothing, so inlining `Order` while leaving out the `Customer` it
  references emitted a module that did not typecheck. They now carry the
  transitive closure, in dependency order.

  **Performance:** the native emitter rendered the entire schema file and
  string-searched it once per model per tag — quadratic in (tags x models), and
  brittle besides. Each expression is now computed once, directly. Measured on a
  960-operation spec: 48.2ms to 25.0ms at 120 models, and per-operation cost is
  now flat in model count (was 30 to 50us/op across 30 to 120 models).

- [#3705](https://github.com/pyreon/pyreon/pull/3705) [`ca1d774`](https://github.com/pyreon/pyreon/commit/ca1d774ac00c2869defc0f08b3ffd0aa625050eb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `lathe diff <rev>:<path>` now resolves `<path>` relative to the working directory, like the on-disk side of the diff. It was read from the repository root, so from a subdirectory — a monorepo package, a workflow step with `working-directory` — `main:openapi.yaml` compared the root's spec (or nothing, exit 2) against the package's. An explicit `./` / `../` is honoured as written.

  The documented GitHub Action now finds its own PR comment by a hidden `<!-- lathe-contract -->` marker instead of `gh pr comment --edit-last`, which edited whichever comment the workflow token wrote last — in a repository with any other bot comment, that one. It also writes the report to the job summary, skips the comment on fork pull requests (read-only token) instead of failing the check, and retries a failed post before downgrading it to a warning. Update a copied workflow from the docs.

- [#3513](https://github.com/pyreon/pyreon/pull/3513) [`d452a6c`](https://github.com/pyreon/pyreon/commit/d452a6c391cbeb4a325978fbf708a1599f524b3c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Close the remaining spec-string injection surfaces in the emitters.

  A regex literal is emitted from two places, not one. `mockPath` escaped regex
  metacharacters and no line terminator, so a spec path carrying `\n`, `\r`,
  U+2028 or U+2029 emitted an unterminated literal and took the whole `mocks.ts`
  module with it, under the default config. Both sites now spell the literal
  through one escape-aware `regexLiteral`.

  On a docs page: a parameter name went raw into a Markdown table cell (a `|`
  splits the row, a newline ends it), a control character went raw into a
  double-quoted YAML scalar (js-yaml refuses the whole document on NUL/BEL/ESC,
  so the page was unreadable to `gray-matter`), and a query wire name plus an
  enum value went raw into the fenced TypeScript usage snippet a reader copies.

  One generated file changes: a parameterised mock route's `/` inside a character
  class is now escaped (`[^\/?#]`), which matches the same URLs as before.

- [#3687](https://github.com/pyreon/pyreon/pull/3687) [`181eac5`](https://github.com/pyreon/pyreon/commit/181eac590c765191c38838f93093fc19c5d08e92) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Generated interfaces keep an enum's literal union. `Pet.status` was typed
  `string` although its schema accepts only `'available' | 'pending' | 'sold'`:
  the emitted `s.enum([...])` inferred `string` (the array literal widened), and
  the interface was written as `string` to agree with it. The schema is now
  emitted as `s.enum([...] as const)`, so the schema's inferred type and the
  interface both carry the union — for string, numeric, boolean, mixed and
  `const` values, optional, nullable and array positions, on both validators.
  Code assigning an arbitrary string to such a field now gets a type error it
  should always have had.

- [#3077](https://github.com/pyreon/pyreon/pull/3077) [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop spec-controlled strings injecting code into generated files.

  Flagged by CodeQL as "code construction depends on an improperly sanitized
  value". Auditing the class found three real holes, none of them visible in the
  emitted string:

  - **A `//` line comment ends at the first line terminator.** A spec `title` of
    `T\nglobalThis.pwned=1;//` put executable code in every generated file's
    banner — the severe one, because a banner is the last place anyone looks.
  - **A `/* */` block ends at `*/`.** A `description` containing it closed the
    JSDoc and dropped the remainder into code position.
  - **`\r`, U+2028 and U+2029 are line terminators in JavaScript**, so an escaper
    handling only `\n` emitted string literals a spec enum value could end.

  A fifth was the one the scanner actually pointed at, and the audit above missed
  it by assuming identifiers were the safe part: parameter NAMES reached a TYPE
  position raw, so a spec name of `a: string }, INJECTED: () => void, z: { b`
  closed the type and injected an arbitrary parameter into the generated function
  signature. It carried a correctness bug too — the path placeholder was already
  normalized while the parameter name was not, so the two disagreed for any name
  that was not already an identifier, and the emitted call set a key the endpoint
  never read. Path parameter names now take the same normalization as their
  placeholder; query names are wire names (`?page=2`) so they stay verbatim and
  are quoted at emit instead.

  A fourth hid one layer down: `JSON.stringify` leaves U+2028/U+2029 raw, so the
  mock fixtures, the Atlas scenario args and quoted property keys all inherited
  the third. Values bound for a line comment now have their line terminators
  collapsed, block comments have `*/` broken, string literals escape all four
  terminators plus the C0 controls (round-tripping, so the schema still matches
  the spec), and JSON output is re-escaped before it reaches source.

  The regression suite EXECUTES the emitted module and asserts no injected global
  was set — every payload produces output that reads entirely plausibly, so a
  string-level assertion passes against all of them.

- [#3729](https://github.com/pyreon/pyreon/pull/3729) [`9ef58ed`](https://github.com/pyreon/pyreon/commit/9ef58ed9100edd53ff54a7a2ea277ea51bcfc7cc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native modules (`target: 'multiplatform'`) name each model's schema after the model again — `export const Pet = s.object(…)` beside `export type Pet`, the same as the web output — instead of `pet_schema`. The `_schema` suffix existed only because Swift and Kotlin have one namespace, and `@pyreon/native-compiler` now separates a value from a same-named type itself. Regenerate to pick it up; anything importing `<model>_schema` from a generated `.native.tsx` module must switch to the model name.

- [#3465](https://github.com/pyreon/pyreon/pull/3465) [`5c213ea`](https://github.com/pyreon/pyreon/commit/5c213ea5f6b6f9fd767c39f5c3bfe9d796151fc0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Two generator bugs, both silent

  **`createX(overrides)` leaked the root's overrides into every nested
  object.** A field's value was rendered at the same depth as the object
  holding it, so a nested object also took the `depth === 1` overrides
  spread. `createUser({ id: 'x' })` therefore produced
  `address: { city: …, id: 'x' }` — a shape the schema generated from the
  same spec rejects, so the fixture fails the validator and the error
  points at the consumer's test data.

  **`lathe generate --help` generated instead of printing help.** The verb
  unconditionally overrode the `--help` flag, so the one flag a user types
  when they are unsure wrote a client into their repo. `--help` now wins,
  and a bare path still reads as `generate`.

- [#3723](https://github.com/pyreon/pyreon/pull/3723) [`3603fa4`](https://github.com/pyreon/pyreon/commit/3603fa4c9c8265deb507d26798ef517156e5ce13) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A `null` entry in `patches` is refused with its message (`must be an object like { op, path, value }`), not a `Cannot read properties of null` crash.

- [#3077](https://github.com/pyreon/pyreon/pull/3077) [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Expand a plugin selection along the import edges of the emitted code.

  `plugins: ['components']` emitted previews importing `./queries/...` that were
  never generated, and `plugins: ['atlas']` emitted `mocks.ts` importing a
  `./client` that did not exist — output that looks complete and does not
  resolve. These are import edges in the generated code, not preferences, so a
  selection is now expanded to cover them and the report names what came along:

  ```
  plugins: components (+schemas, +client, +queries - required by them)
  ```

  Expanded rather than refused: someone asking for `components` wants browsable
  previews, and the hooks they are built from are an implementation detail of
  that answer.

  `components` does **not** depend on Atlas — the previews are ordinary Pyreon
  components over the generated hooks, so a project that wants them without a
  workbench selects `components` and gets exactly that. The dependency runs one
  way only, and a test now walks every emitted relative import across every
  plugin combination to keep it that way.

- [#3077](https://github.com/pyreon/pyreon/pull/3077) [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix four emit bugs found by running GitHub's OpenAPI document through the
  generator and typechecking the output.

  12.9 MB, 973 models, 1222 operations. All four produced code that read
  perfectly and did not compile — which is the point of a hostile spec: you do
  not think to write the shapes that break you.

  - **A one-member `oneOf`.** `s.union` requires at least two members; a
    one-member union is just that member, and now collapses to it.
  - **A `discriminator` whose members are not all objects.**
    `GET /repos/{}/contents/{}` discriminates over a set including an ARRAY
    branch, and `s.discriminatedUnion` takes object schemas only. It degrades to
    a plain union, with a note saying why.
  - **A `$ref` in a PARAMETER's schema.** Only response and body refs were
    collected, so a model named in the args type was never imported.
  - **An empty `oneOf`/`anyOf`** already degraded to `unknown` safely, but
    silently. It now says so.

  Measured on that spec after the fixes: parse 54ms, generate 80ms, 96 files,
  2.8 MB of output, 75 MB peak heap — and the emitted client typechecks with
  zero errors.

- [#3121](https://github.com/pyreon/pyreon/pull/3121) [`ec0aff6`](https://github.com/pyreon/pyreon/commit/ec0aff6672efcac6f135b1f32b0b7e72e96db08c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Closes every open finding from the lint audit, and adds the leak class nothing
  caught.

  **The 280 `querySelector(…) as HTMLX` casts are gone.** They were ratcheted
  because 92 files across 12 packages is not a safe hand-edit; a codemod with
  paren-balancing did it, and the conversion is verified rather than assumed —
  `query()` THROWS where a cast silently returned null, so a wrong conversion
  fails loudly. Typecheck clean across all 17 packages, node tests green, and
  **476 browser tests in real Chromium** covering the sites that only exist
  there. The doctor grade goes **F → A**, the ratchet drops **284 → 9**, and
  `no-query-selector-cast-in-test` is back at `error` rather than the `warn` it
  was demoted to in order to fire at all.

  **A ReDoS I introduced, caught by CodeQL.** `js/polynomial-redos`, high
  severity: `/(?:^|\/)routes\/(.+)$/` backtracks on paths with many `/routes/a`
  repetitions, and a linter is handed whatever paths its caller has. Replaced
  with linear string slicing — which also fixed a real misclassification, since
  the greedy regex anchored on the FIRST `/routes/` and mis-resolved nested
  paths. Both halves are pinned.

  **New rule — `pyreon/no-unguarded-async-signal-write`** (opt-in), for memory
  leak class F, which the catalog lists as caught by nothing. A slow earlier
  response resolves last and overwrites newer data: not a crash, not visible in
  a heap snapshot, just the wrong answer intermittently. Precision came from
  measuring — 42 findings became 9 after two narrowings the corpus taught:
  tests and benches cannot race with themselves, and `Map.set(key, value)` takes
  two arguments where a signal write takes one.

  It found two real bugs, both fixed: `<Mermaid>` and `<Math>` wrote their
  rendered output after an await with no cancellation, so unmounting mid-render
  kept the whole closure alive for a signal nothing reads.

  **Two rules stopped keying on what a thing is NAMED.** `no-mutate-store-state`
  fired only when a variable name contained "store" — renaming `cartStore` to
  `cart` disabled it silently. It now tracks the binding. `toast-a11y` exempted
  the literal spelling `Toaster`, so `import { Toaster as AppToast }` was
  reported for missing a11y it already has; the exemption follows the import.

  **`<Icon svg>` now states its contract.** It renders raw and cannot sanitize —
  the sanitized `innerHTML` prop needs a `DOMParser` and so cannot run during
  SSR, which an icon must. Rather than change that, the prop documents that it
  takes markup you control, and the new lint rule flags misuse in consumer code.

  **A bundle-budget failure now explains itself.** gzip differs between macOS and
  the ubuntu runner — measured ~177 B on a 16.5 KB package — so a budget with
  less headroom than that fails on CI while passing locally. The overage message
  now says when it is inside that band.

  Also fixes an untimed `fetch()` in `lathe pull` that could hang the CLI
  forever against a server that accepts and never answers.

  **The ratchet is now empty.** Every advisory finding is resolved rather than
  carried:

  - The five leak-class-F sites got real guards, and three were genuine
    concurrency bugs rather than style issues: `useWakeLock` and
    `useAudioRecorder` both checked their "already running" flag BEFORE the
    await, so two calls arriving during it each acquired a resource and orphaned
    the first — a wake lock held with nothing able to release it, a microphone
    stream left open. `useDeviceMotion` would attach its listener twice.
    `useClipboard` and atlas's source viewer could land a stale value.
  - `<CodeBlock>`'s line-number gutter no longer builds an HTML string at all. It
    was a workaround for a compiler bug that has since been fixed, so it was a
    raw sink in a component that never needed one; it renders real nodes now.
  - The three remaining sinks cannot be routed through the sanitized `innerHTML`
    prop, and that is verified rather than assumed: the allowlist deliberately
    excludes `foreignObject` and `<style>` (which mermaid emits for labels and
    theming) and does not cover MathML at all (which is all KaTeX emits), so
    sanitizing would strip working output. They are hardened at the library
    layer instead — `securityLevel: 'strict'` for mermaid, `trust: false` for
    KaTeX — and exempted with that reasoning recorded at each call site.

  The rule that found them also learned two things from being wrong: an in-flight
  promise shared between callers is a staleness guard just as much as a version
  counter, and a guard may live one scope out from the `async` function that
  writes.

- [#3121](https://github.com/pyreon/pyreon/pull/3121) [`ec0aff6`](https://github.com/pyreon/pyreon/commit/ec0aff6672efcac6f135b1f32b0b7e72e96db08c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Role-aware rule tiers — one config now covers server, client, isomorphic and
  multiplatform code, with no glob `overrides`.

  A general-purpose linter splits backend from frontend with hand-written globs
  the user keeps in sync. A framework does not have to guess: an fs-router API
  route, a `node:` import, an `island()` call and an entry file each PROVE where
  a file runs. `resolveFileRole()` reads them, strongest signal first, and
  defaults to `shared` — the strict answer, because an isomorphic file must
  satisfy both sides and guessing either one silently disables the other's rules.

  **This was already happening, badly.** Two rules classified server files with
  `filePath.includes('server')`, and `observer` contains `server` — so
  `use-intersection-observer.ts`, a client hook, was treated as a server file by
  both. Reproduced against `lintFile`, then fixed. A third rule re-implemented
  `isTestFile` inline, omitting `/__tests__/`.

  **Eleven new rules across five new groups** (113 rules, 25 categories,
  10 groups). Every one gated by the RUNNER via `appliesTo`, never by the rule —
  `exemptPaths` was opt-in per rule and 55 of 102 silently ignored it, and a role
  gate written rule-by-rule would repeat that exactly.

  - **`isomorphic`** — `no-locale-dependent-format`, `no-timezone-dependent-date`,
    `no-unstable-render-id`, `no-node-builtin-in-component`. Hydration mismatches
    that are correct in every unit test and wrong for some users in production.
  - **`backend`** — `no-sync-fs-in-request-path`, `no-floating-promise-in-handler`.
  - **`web-perf`** — `prefer-passive-listener`, `no-unbounded-raf-loop`.
  - **`portable`** — `no-out-of-subset-construct`, `no-platform-branch-without-fallback`.
    PMTC warns about these too, but only for files a native app's entry graph
    reaches; the catalog names that gap directly ("a feature no example uses is
    one no gate ever compiles"). These fire at authoring time instead.
  - **`js`** — `require-error-cause`.

  **Precision came from measurement, not taste.** Run unscoped against this repo
  the first cut produced **over 5,000 findings**; reading them produced five
  narrowings, and the final count is **11**:

  | finding              | cause                                                            | narrowing                                                |
  | -------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
  | 4,388 subset         | web-only internals are entitled to the whole language            | fires only where `portablePaths` says a file must travel |
  | 469 floating promise | a shared util is not a request handler                           | the file must EXPORT a handler                           |
  | 149 sync fs          | Vite plugins and the compiler are server-role, not request paths | same handler gate                                        |
  | 14 raf               | a one-shot frame is ordinary                                     | must schedule ITSELF                                     |
  | 1 raf                | a double-rAF terminates                                          | self-REFERENCE, not merely nested                        |
  | 11 locale            | benches print to a console                                       | `bench/` and `e2e/` are build role                       |
  | 2 timezone           | `new Date(y, m, d).getDate()` is timezone-independent arithmetic | only Dates representing an INSTANT                       |
  | 2 error-cause        | a custom error class has no options slot                         | built-in error constructors only                         |

  **Two real bugs found and fixed by the new rules.** The scaffolded dashboard
  template formatted money and dates with no locale in 14 places — every
  generated app shipped a hydration mismatch on its own front page. Fixed with a
  `lib/format.ts` that pins locale AND timezone, which is also the pattern users
  should copy. And five `throw new Error(msg)` sites inside `catch` now pass
  `{ cause }`, so the stack points at what actually broke.

  Also closes the review finding on `no-unsanitized-inner-html`: a dead
  assignment was a half-written hop loop, and finishing it fixed a real
  false positive — a sanitized value that had been renamed once
  (`const body = clean`) was flagged.

- [#3732](https://github.com/pyreon/pyreon/pull/3732) [`7c69228`](https://github.com/pyreon/pyreon/commit/7c6922838c8c05695b320c62d5758e3379840560) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useStream`'s `enabled` and `onEvent` options, and a runtime `json` body, now lower to iOS and Android.

  - `@pyreon/native-compiler`: `enabled` (a boolean, an expression, a bare signal, or an accessor) joins the stream harness key — a flip stops or re-opens the stream, and `false` reads `idle` while keeping the events already received, the web hook's disabled branch. An inline `onEvent: (event) => …` runs after each event lands, with the event typed as the stream's item; one that reads its second (QueryClient) argument keeps the stream web by name, since native queries have no shared client. A RUNTIME `json` body (`json: { prompt: prompt() }`) is serialized per run through the `JSON.stringify` lowering with `content-type: application/json` and is part of the key, so a new value re-opens the stream as the web's tracked source does — an explicitly triggered POST stream is `enabled: () => sent()`. Before, the endpoint resolver sent such a request with NO body.
  - `@pyreon/http` native runtime: `PyreonStream.idle()` (both targets) and an `onEvent` parameter on `runSse` / `runNdjson` (Swift) and `startSse` / `startNdjson` (Kotlin). On Kotlin it runs on the stream's own thread, in wire order.
  - `@pyreon/lathe`: a stream-only non-GET operation's reach reason now names the real gap — the generated native components open on mount with params as their only props, so there is no generated trigger/body surface — instead of blaming the mutation lowering.
  - `@pyreon/query`: the `useStream` manifest entry documents the native lowering of the new options.

- [#3681](https://github.com/pyreon/pyreon/pull/3681) [`bcb04bd`](https://github.com/pyreon/pyreon/commit/bcb04bd844bd46bb8f30760e269f38746e911b5e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/native-compiler`: `.url()` lowers to the AUTHORING library's rule. `@pyreon/validate`'s `s.string().url()` is http(s)-only on the web, but PMTC lowered it (and zod's) to "any scheme", so a device accepted `javascript:alert(1)` where the browser rejects it; `.url({ protocol })` lowered with the option ignored. The rule now travels in the IR: zod keeps any-scheme, `s` lowers to its exact `URL_RE`, and `protocol` lowers to an RFC 3986 URI check plus the scheme pattern. The patterns are written for ICU and java.util.regex where they differ from JS (`\s`, `.`, `$` before a trailing newline, case folding), and web↔native verdicts are asserted by executing the emitted Swift and Kotlin. A `protocol` that is not an inline portable regex literal declines with a named warning.

  `@pyreon/lathe`: `format: uri` emits the same `.url({ protocol })` in native modules as on the web, so a device no longer rejects the `git:` / `mailto:` URIs the web accepts.

- [#3750](https://github.com/pyreon/pyreon/pull/3750) [`5f5bedf`](https://github.com/pyreon/pyreon/commit/5f5bedf81133dc6128486b083cdf59b8496c7c29) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Schema-bearing native modules now compile TOGETHER. PMTC used to emit `PyreonSchemaError` (and `PyreonParseResult`) into every file that declared a schema, so two such files in one Xcode target or Gradle source set failed with `invalid redeclaration` / `Redeclaration` even though each compiled on its own. Both types now live in the native runtime (`PyreonSchema.swift` / `PyreonSchema.kt`) and are declared once. An app must link the updated `@pyreon/native-runtime-swift` / `-kotlin`; emitted code from this compiler no longer declares them.

  `Pet.safeParse(value)` now lowers when `value` holds a typed struct or data class (a signal read, a variable, a call), and when a typed value sits inside an object-literal argument. It is converted through the value's own `Codable` / `@Serializable` encoding by the new runtime helpers `pyreonSchemaInput` / `pyreonSchemaValue`. Previously the whole-value form did not compile, and the nested form compiled but rejected valid data.

  A schema's nested structs now follow a value/type rename: `PyreonZodSchema_BookValue_Author` instead of `PyreonZodSchema_Book_Author` beside `PyreonZodSchema_BookValue`.

  New: `validateSwiftFilesWithStubs` / `validateKotlinFiles` compile several emitted files as one module, the only check that can see a collision between files. `@pyreon/lathe`'s verify uses them when present and reports the result as `report.modules`; a failure there makes the report `broken`.

- [#3767](https://github.com/pyreon/pyreon/pull/3767) [`78f9652`](https://github.com/pyreon/pyreon/commit/78f965269befa8060db6661e9ce586f3d10c5337) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Keep private session and preview HTML out of the PWA offline cache, remove the legacy runtime cache on activation, and normalize preview redirects before allowing same-origin paths. Public navigation caching now requires an explicit `Cache-Control: public` response.

  Bound generated webhook request bodies to 1 MiB by default, with a configurable `bodyLimit` enforced on both declared length and streamed bytes before authentication or dispatch. Refuse inherited property names when selecting webhook schemas and handlers.

  Preserve optional member-read types in native computed values, distinguish nested Swift structs by their complete typed shape, and emit explicitly annotated zero-argument value helpers as native functions. Flatten array spreads in WebView JSON payloads, including empty and nested spread fragments, and preserve sibling CSS declarations when tagged templates contain CSS escapes without a cooked JavaScript value. Align the native validation stubs with SwiftUI border overlays and Compose per-side padding.

- [#3557](https://github.com/pyreon/pyreon/pull/3557) [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop publishing the build's bundle-analysis report.

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

- [#3714](https://github.com/pyreon/pyreon/pull/3714) [`4188e73`](https://github.com/pyreon/pyreon/commit/4188e73e27514dcc22c7f1e05fbaee08a5dae426) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Drop four runtime dependencies from `@pyreon/zero-content` in favour of small first-party implementations: `gray-matter` (frontmatter split + parse), `fast-glob` (the `src/mdx/` scan), `unist-util-visit` (the remark-plugin tree walker) and `mdast-util-to-string` (declared but never imported). YAML is now read by `yaml` — the parser `@pyreon/lathe` already ships — with timestamps and `<<` merge keys enabled as js-yaml had them, and the 214 pages of the docs site compile byte-identically before and after.

  Behaviour changes, all at the edges: numbers follow YAML 1.2 (`010` → 10 not 8, `1:30` and `1_000` stay strings); `---js` frontmatter is refused instead of `eval`ed; frontmatter that is not a mapping (a bare scalar, a list) throws with a clear message instead of becoming the page's `data`; a control character inside a `#` comment or a DEL inside quotes now throws; the `src/mdx/` scan returns files in sorted order and does not follow a symlink back to its own ancestor. `parseFrontmatter` is exported from `@pyreon/zero-content/plugin` so page emitters can test against the reader that consumes their output; `@pyreon/lathe`'s docs tests now do.

- Updated dependencies [[`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`1a64907`](https://github.com/pyreon/pyreon/commit/1a64907717ca2734bedaceceda00d368e0c0f2a9), [`fdd4dc2`](https://github.com/pyreon/pyreon/commit/fdd4dc2aef317b1c177f9751fcffb6d88554ff92), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`c6bcb95`](https://github.com/pyreon/pyreon/commit/c6bcb955d3d93745b8cb9dfe9b188bcf53f58f8b), [`4cae873`](https://github.com/pyreon/pyreon/commit/4cae873e6e08f785b4d7616611325e14c7421fb1), [`c12635c`](https://github.com/pyreon/pyreon/commit/c12635c3a9c423ac7b860293b0397583970235dd), [`81e52fb`](https://github.com/pyreon/pyreon/commit/81e52fb2c2c92596497f741cedb2398b426e2df7), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`e83a9bf`](https://github.com/pyreon/pyreon/commit/e83a9bfd2ce0d1697ee25618ba01d9840a1e6415), [`7b1351b`](https://github.com/pyreon/pyreon/commit/7b1351b7b774b6caeb7bf2d4f406f6306e146981), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`fbb41d9`](https://github.com/pyreon/pyreon/commit/fbb41d9c02351d6986cc579034a3290d2b37cc2e), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c), [`6f79b9d`](https://github.com/pyreon/pyreon/commit/6f79b9d8ed021ec4f069009b95e26cb1a647d922), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`81e52fb`](https://github.com/pyreon/pyreon/commit/81e52fb2c2c92596497f741cedb2398b426e2df7), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`9f271ae`](https://github.com/pyreon/pyreon/commit/9f271aeb2c28c58a04d443c945d30c8114a355ff), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`e669817`](https://github.com/pyreon/pyreon/commit/e6698175ffe21651057be52086b2706177e854d0), [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`6c32d06`](https://github.com/pyreon/pyreon/commit/6c32d06f66afbb7fd50613e757c0b7c8dcaff957), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db), [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db), [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db), [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db), [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`d4e3a2f`](https://github.com/pyreon/pyreon/commit/d4e3a2ff77159bdfffb386313c4a7854fd07f7dd), [`6888c29`](https://github.com/pyreon/pyreon/commit/6888c2982adcfd0fe333255efeae3cfc1107304d), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`c6bcb95`](https://github.com/pyreon/pyreon/commit/c6bcb955d3d93745b8cb9dfe9b188bcf53f58f8b), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`0295aaa`](https://github.com/pyreon/pyreon/commit/0295aaaac118b3f8716a09b2549179be3110e8a0), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`c6bcb95`](https://github.com/pyreon/pyreon/commit/c6bcb955d3d93745b8cb9dfe9b188bcf53f58f8b), [`8e098c3`](https://github.com/pyreon/pyreon/commit/8e098c347a9670b083261cfabf67dc04b251f641), [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`37e05d6`](https://github.com/pyreon/pyreon/commit/37e05d686f157a30d4839e4d168270a441e49f1f), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`9a323c2`](https://github.com/pyreon/pyreon/commit/9a323c2a9b5e5cde271b1e69cec84b002a774d39), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`f22774f`](https://github.com/pyreon/pyreon/commit/f22774ffe70af6d7be01313b27eefdbb97bd0a8f), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`7e489de`](https://github.com/pyreon/pyreon/commit/7e489de122f59b4e4e8db032a61a254ed0e10019), [`74e9151`](https://github.com/pyreon/pyreon/commit/74e9151bd2ee24171e3239f0e187842521c0e582), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`02255a2`](https://github.com/pyreon/pyreon/commit/02255a26ad0c83244633436858a178441d061b95), [`c19fb0d`](https://github.com/pyreon/pyreon/commit/c19fb0d9ca1b5457ecefd9e4d99473214468dfec), [`52b0b60`](https://github.com/pyreon/pyreon/commit/52b0b60e4a7739b8811aeaa75425326e59630ae6), [`02255a2`](https://github.com/pyreon/pyreon/commit/02255a26ad0c83244633436858a178441d061b95), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`59123f2`](https://github.com/pyreon/pyreon/commit/59123f278a88563c81ce781282d650bfe311879f), [`57b94ed`](https://github.com/pyreon/pyreon/commit/57b94ed8cd4b2aa9d5bd16e52d39edcdb7056c62), [`1c70f68`](https://github.com/pyreon/pyreon/commit/1c70f68b69a7e9f60eb7d565bf8797a155353743), [`fee8cf9`](https://github.com/pyreon/pyreon/commit/fee8cf96d1f28457a8cad768d304b151f42f9dd0), [`da12179`](https://github.com/pyreon/pyreon/commit/da12179167ebedb7058462e5261a4efc6b2d2435), [`c4c2d52`](https://github.com/pyreon/pyreon/commit/c4c2d5232856e31b733dbc992ea8cbb37201f53f), [`78b3423`](https://github.com/pyreon/pyreon/commit/78b3423b830ec4c5d60034ae8f468eec111cacf2), [`6bf2770`](https://github.com/pyreon/pyreon/commit/6bf2770d8d25e02aa853ac249b6c07923dac001d), [`ea669a1`](https://github.com/pyreon/pyreon/commit/ea669a11028d7067e80b8c59bb2f5d35d5cbda1b), [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93), [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e), [`cc455e8`](https://github.com/pyreon/pyreon/commit/cc455e84d9ed7d682d963d44b25cd3c4bb89c7c8), [`26e1837`](https://github.com/pyreon/pyreon/commit/26e1837c562b35887a5b3866fc0251f086f32063), [`5ff6d4a`](https://github.com/pyreon/pyreon/commit/5ff6d4a1ea651d28b262a0b1250faaee71027c3c), [`78b3423`](https://github.com/pyreon/pyreon/commit/78b3423b830ec4c5d60034ae8f468eec111cacf2), [`8b8e2c3`](https://github.com/pyreon/pyreon/commit/8b8e2c331fb62690360254e720b05e256ca2850b), [`8637009`](https://github.com/pyreon/pyreon/commit/863700940660cacfe517bdb57db2e0dc3ce69da3), [`cce5404`](https://github.com/pyreon/pyreon/commit/cce54042e9c2a953ffcc2a774cc42abf2b08f5ef), [`cce5404`](https://github.com/pyreon/pyreon/commit/cce54042e9c2a953ffcc2a774cc42abf2b08f5ef), [`faeb942`](https://github.com/pyreon/pyreon/commit/faeb942b9d87b67d0510faf894974cd123b1ce35), [`2ff475b`](https://github.com/pyreon/pyreon/commit/2ff475baccb91654ad541a444269b452e6443142), [`cce5404`](https://github.com/pyreon/pyreon/commit/cce54042e9c2a953ffcc2a774cc42abf2b08f5ef), [`9e2d7e5`](https://github.com/pyreon/pyreon/commit/9e2d7e5f78cbef41b19675e0c9dad27e36cb2e7c), [`411a373`](https://github.com/pyreon/pyreon/commit/411a3735a340bae20370de806eb3650b153b05ce), [`cce5404`](https://github.com/pyreon/pyreon/commit/cce54042e9c2a953ffcc2a774cc42abf2b08f5ef), [`cce5404`](https://github.com/pyreon/pyreon/commit/cce54042e9c2a953ffcc2a774cc42abf2b08f5ef), [`8b8e2c3`](https://github.com/pyreon/pyreon/commit/8b8e2c331fb62690360254e720b05e256ca2850b), [`1e03f8b`](https://github.com/pyreon/pyreon/commit/1e03f8bb4428acd88166d7d4dd0cc429048c211e), [`411a373`](https://github.com/pyreon/pyreon/commit/411a3735a340bae20370de806eb3650b153b05ce), [`9e2d7e5`](https://github.com/pyreon/pyreon/commit/9e2d7e5f78cbef41b19675e0c9dad27e36cb2e7c), [`9e2d7e5`](https://github.com/pyreon/pyreon/commit/9e2d7e5f78cbef41b19675e0c9dad27e36cb2e7c), [`8b8e2c3`](https://github.com/pyreon/pyreon/commit/8b8e2c331fb62690360254e720b05e256ca2850b), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`a39f457`](https://github.com/pyreon/pyreon/commit/a39f45733c464f908ddb05108d738b430ea82a84), [`9d6ca3d`](https://github.com/pyreon/pyreon/commit/9d6ca3d705b555a2bb52d6dfd0c5fe231ff69f5c), [`4e8a34d`](https://github.com/pyreon/pyreon/commit/4e8a34d62a644b7449f62ff853853a96812b2170), [`5f9c82c`](https://github.com/pyreon/pyreon/commit/5f9c82c34ac43870d1f768050174ca46139a898a), [`8abff03`](https://github.com/pyreon/pyreon/commit/8abff031996482ce254217d84370b2ec5e0d89a2), [`2eb07b2`](https://github.com/pyreon/pyreon/commit/2eb07b28dc0f64f5c65a809edc4ffcf2befe703f), [`cf50c79`](https://github.com/pyreon/pyreon/commit/cf50c79668fa46510df17f76906520c53d6e0e4a), [`b5bbce2`](https://github.com/pyreon/pyreon/commit/b5bbce23dcda3b05c17ba7a97eb596b97a10c2de), [`b7b499e`](https://github.com/pyreon/pyreon/commit/b7b499e61d65cdaedeea977a2a1d5daf278353ae), [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`f2194d5`](https://github.com/pyreon/pyreon/commit/f2194d544ca7fc10dcc64b2aeb1c97dc923eabfe), [`b976aa0`](https://github.com/pyreon/pyreon/commit/b976aa02bd47feceb8c3fe574edf676dc190ae37), [`fc91492`](https://github.com/pyreon/pyreon/commit/fc91492c18cba19e38811486884eba76a46ef832), [`a9fe413`](https://github.com/pyreon/pyreon/commit/a9fe41379e385c6b1fdddeedea62891d29108398), [`bcb04bd`](https://github.com/pyreon/pyreon/commit/bcb04bd844bd46bb8f30760e269f38746e911b5e), [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb), [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5), [`2a85027`](https://github.com/pyreon/pyreon/commit/2a85027c190335e782bd581b5856ae2ef783207d), [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5), [`c41314d`](https://github.com/pyreon/pyreon/commit/c41314da54f7217a4a63cd0d6ec07583fd431001), [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb), [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb), [`1275e17`](https://github.com/pyreon/pyreon/commit/1275e1726fed67b467377db956fda44827161589), [`ea4e50a`](https://github.com/pyreon/pyreon/commit/ea4e50ab7d97d84f2bd5518ea747280c34805611), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`ae94355`](https://github.com/pyreon/pyreon/commit/ae94355b40dc371a558c7d923eee646c20148a62), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`02c2bd9`](https://github.com/pyreon/pyreon/commit/02c2bd9140968826fb1251f818dc5bb919e5ba78), [`408b9b5`](https://github.com/pyreon/pyreon/commit/408b9b5324bb06acd528abf9d21642bb93beb732), [`9ef58ed`](https://github.com/pyreon/pyreon/commit/9ef58ed9100edd53ff54a7a2ea277ea51bcfc7cc), [`cce02b3`](https://github.com/pyreon/pyreon/commit/cce02b3a351cc70939b73756715fd1d165aa3580), [`1373888`](https://github.com/pyreon/pyreon/commit/13738883a6c9f98398f2d31cd631adf41a5e9f5f), [`6888c29`](https://github.com/pyreon/pyreon/commit/6888c2982adcfd0fe333255efeae3cfc1107304d), [`1373888`](https://github.com/pyreon/pyreon/commit/13738883a6c9f98398f2d31cd631adf41a5e9f5f), [`39db4ce`](https://github.com/pyreon/pyreon/commit/39db4ce30422821ac781e72d7cc27f43ac523e17), [`ed6518a`](https://github.com/pyreon/pyreon/commit/ed6518a68ec678e546713abf4e2551a3297a794f), [`dfdb7f4`](https://github.com/pyreon/pyreon/commit/dfdb7f4952d6f61dfe22fadab1e7bc31175d619f), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`dfc7231`](https://github.com/pyreon/pyreon/commit/dfc7231c48b58fb2fcd90f066d847f2c0d4faf36), [`a73f4e1`](https://github.com/pyreon/pyreon/commit/a73f4e1c992d3e5b801fdef4f7c2a69226c5f175), [`1265d08`](https://github.com/pyreon/pyreon/commit/1265d080ca5abec0702682ffc6b8967eb6f41cef), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`e1161d6`](https://github.com/pyreon/pyreon/commit/e1161d6ec1446d826c0c46108376a27fe34831aa), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`5228a4f`](https://github.com/pyreon/pyreon/commit/5228a4ffcec534f2aa81197c30fecaa3b3e5632d), [`2d2a0f5`](https://github.com/pyreon/pyreon/commit/2d2a0f5d5df6816c7996012ab1535e05ffd17b4f), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`fc67b63`](https://github.com/pyreon/pyreon/commit/fc67b6322a2e15a7dc8ad464370109c1218ef35a), [`f0146a8`](https://github.com/pyreon/pyreon/commit/f0146a8398649999a6ddceab5deea64eda99a18a), [`8b49de2`](https://github.com/pyreon/pyreon/commit/8b49de2f440c9e4be30402a499b91e53bf7705f1), [`cc2467b`](https://github.com/pyreon/pyreon/commit/cc2467bc24af0bab7821e96188ac6d35bc50e5b1), [`6dc4d21`](https://github.com/pyreon/pyreon/commit/6dc4d21d337a53d6da54c8ce0026fc9b98e1d348), [`cb67b5f`](https://github.com/pyreon/pyreon/commit/cb67b5f40aabf2f585d8285784122ec7584dbc1c), [`9b1f957`](https://github.com/pyreon/pyreon/commit/9b1f9570a0f6cefb5844db9db53b1a2da4935f05), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`0f89399`](https://github.com/pyreon/pyreon/commit/0f89399bace3aced249b79a5d1bd8bfde76b19db), [`cbb7c29`](https://github.com/pyreon/pyreon/commit/cbb7c29bcec79e45be426d95c72f2f4f5556a89c), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`d873013`](https://github.com/pyreon/pyreon/commit/d873013b7c3ba8f4e2bc5984b974e684009a287d), [`5a31e4e`](https://github.com/pyreon/pyreon/commit/5a31e4e42c420fbeb5c61ea6455df721c4f7d66b), [`33388e8`](https://github.com/pyreon/pyreon/commit/33388e8ded998f953e864ed863e0bff42de2ac8f), [`06c618f`](https://github.com/pyreon/pyreon/commit/06c618f4c871f00bdc0258aac87fb8bd0932cd0b), [`411a373`](https://github.com/pyreon/pyreon/commit/411a3735a340bae20370de806eb3650b153b05ce), [`1abcaef`](https://github.com/pyreon/pyreon/commit/1abcaef257b9f33b266bde3527ba1c34fcd1ba77), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50), [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50), [`7b1351b`](https://github.com/pyreon/pyreon/commit/7b1351b7b774b6caeb7bf2d4f406f6306e146981), [`3d22293`](https://github.com/pyreon/pyreon/commit/3d22293f162c78920fcdc7cd898c19859152ba53), [`83983ab`](https://github.com/pyreon/pyreon/commit/83983ab52f0c44acf902cc70167a5eb860231b47), [`cbb7c29`](https://github.com/pyreon/pyreon/commit/cbb7c29bcec79e45be426d95c72f2f4f5556a89c), [`70f069f`](https://github.com/pyreon/pyreon/commit/70f069f9828deb0f55699d3638bc5087e06a8950), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`ab42b2c`](https://github.com/pyreon/pyreon/commit/ab42b2c82195ad8a875a3a639454a7d836926489), [`6250032`](https://github.com/pyreon/pyreon/commit/6250032a88299dbf1208904ac7596afa0cd0be83), [`2a7ece1`](https://github.com/pyreon/pyreon/commit/2a7ece1be0b6de20a1762383ce5885c8733ee6e0), [`a0611c4`](https://github.com/pyreon/pyreon/commit/a0611c4d5a9afa2472502f5d932e1ac152861e1e), [`4be7791`](https://github.com/pyreon/pyreon/commit/4be7791afaf86864ce03a4548c30b295292e7833), [`1a64907`](https://github.com/pyreon/pyreon/commit/1a64907717ca2734bedaceceda00d368e0c0f2a9), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`ce75e18`](https://github.com/pyreon/pyreon/commit/ce75e187df03a33ae92f151dd17c8a8023eeb90a), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`408b9b5`](https://github.com/pyreon/pyreon/commit/408b9b5324bb06acd528abf9d21642bb93beb732), [`290a386`](https://github.com/pyreon/pyreon/commit/290a38675f6363ac6f8f8d24cab47a70ca081af9), [`ab42b2c`](https://github.com/pyreon/pyreon/commit/ab42b2c82195ad8a875a3a639454a7d836926489), [`2b5be05`](https://github.com/pyreon/pyreon/commit/2b5be059737e000aa8ccd7d481242816f235075e), [`eed8fe9`](https://github.com/pyreon/pyreon/commit/eed8fe99d184bdb0695085e5ec06d17310d4593a), [`27bffa7`](https://github.com/pyreon/pyreon/commit/27bffa76e7d83da12f9c76b4285d88737e8c4640), [`35bd5ae`](https://github.com/pyreon/pyreon/commit/35bd5ae1a62642d0a7c1f51152ff51fcd034afb8), [`f109aea`](https://github.com/pyreon/pyreon/commit/f109aea0486d04500a3d5914ad48563b5c4803bf), [`1373888`](https://github.com/pyreon/pyreon/commit/13738883a6c9f98398f2d31cd631adf41a5e9f5f), [`f26322a`](https://github.com/pyreon/pyreon/commit/f26322ac0220016834d52176c2c5c3d352471601), [`1ac1477`](https://github.com/pyreon/pyreon/commit/1ac1477fdebad50d3ba15acebbf123ed6dda6339), [`1ac1477`](https://github.com/pyreon/pyreon/commit/1ac1477fdebad50d3ba15acebbf123ed6dda6339), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`71c4409`](https://github.com/pyreon/pyreon/commit/71c440942f4befc60b3abd74c503cc6c4b5d80eb), [`408b9b5`](https://github.com/pyreon/pyreon/commit/408b9b5324bb06acd528abf9d21642bb93beb732), [`7c69228`](https://github.com/pyreon/pyreon/commit/7c6922838c8c05695b320c62d5758e3379840560), [`ea12a88`](https://github.com/pyreon/pyreon/commit/ea12a887e736882b5019388ad0c61ba0d1e1490c), [`45a04fb`](https://github.com/pyreon/pyreon/commit/45a04fb6e95af5b6d0dad9d3e76d5d756a218f02), [`7ee508e`](https://github.com/pyreon/pyreon/commit/7ee508efc3f5ed559a5ecfd7bbbefd8bb6785fc2), [`2eb6540`](https://github.com/pyreon/pyreon/commit/2eb6540c024529b2b26bd1bd9d97aeda64a48323), [`cce02b3`](https://github.com/pyreon/pyreon/commit/cce02b3a351cc70939b73756715fd1d165aa3580), [`5fc3b9f`](https://github.com/pyreon/pyreon/commit/5fc3b9fda70b8d96a412b08f7e58e6e0df35e8fe), [`8f53bc7`](https://github.com/pyreon/pyreon/commit/8f53bc76c600458ad950b29c6c7929f5f30225e2), [`bcb04bd`](https://github.com/pyreon/pyreon/commit/bcb04bd844bd46bb8f30760e269f38746e911b5e), [`0dbf4ac`](https://github.com/pyreon/pyreon/commit/0dbf4ac9e16589dca6d6090fb2787992f019f190), [`b1f9914`](https://github.com/pyreon/pyreon/commit/b1f991412dbd53cb2e943678aadbe89a6dfdb513), [`a4ad301`](https://github.com/pyreon/pyreon/commit/a4ad3015e4e949466969175d5a2f9533dc2b9b67), [`1373888`](https://github.com/pyreon/pyreon/commit/13738883a6c9f98398f2d31cd631adf41a5e9f5f), [`2d4cbfc`](https://github.com/pyreon/pyreon/commit/2d4cbfc1ad7c2943699765d9682dec6fb4b011f9), [`2d7a108`](https://github.com/pyreon/pyreon/commit/2d7a1089c6afb3d4dbdbbc4a2434e12ade317449), [`5b93f4c`](https://github.com/pyreon/pyreon/commit/5b93f4cb70a6e210325aca3c79678b62383bc773), [`e56b865`](https://github.com/pyreon/pyreon/commit/e56b865f08946b7f848906bf2562911fa7f95066), [`1612ed1`](https://github.com/pyreon/pyreon/commit/1612ed15b80c220d049212b0f62dabccb45aa9e9), [`50d9324`](https://github.com/pyreon/pyreon/commit/50d93245d8e28ba0a3c8217bd83a50d3dd6719d3), [`5f5bedf`](https://github.com/pyreon/pyreon/commit/5f5bedf81133dc6128486b083cdf59b8496c7c29), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`14978a9`](https://github.com/pyreon/pyreon/commit/14978a9c423dbd96570ca3a8f31d108ca47e6734), [`5867cca`](https://github.com/pyreon/pyreon/commit/5867cca15becbf4811effac32e81bdb3dc0a0d86), [`1025315`](https://github.com/pyreon/pyreon/commit/1025315701d7eb0a2bea2958252c3a0efda34b29), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`41abe4d`](https://github.com/pyreon/pyreon/commit/41abe4d2eb07b2440ada7ae236fe8c8146888000), [`e224194`](https://github.com/pyreon/pyreon/commit/e224194a911b96d9a758edf86f53d38b87ec2052), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`eac9382`](https://github.com/pyreon/pyreon/commit/eac9382537578805a6550eb78370e13e1ed66574), [`8637009`](https://github.com/pyreon/pyreon/commit/863700940660cacfe517bdb57db2e0dc3ce69da3), [`eac9382`](https://github.com/pyreon/pyreon/commit/eac9382537578805a6550eb78370e13e1ed66574), [`67a41a6`](https://github.com/pyreon/pyreon/commit/67a41a62260183c93c1b77de8713650e600ccb0d), [`eac9382`](https://github.com/pyreon/pyreon/commit/eac9382537578805a6550eb78370e13e1ed66574), [`33c8eae`](https://github.com/pyreon/pyreon/commit/33c8eaed5f9123e5932fbd188d9e4b48dcf08240), [`8637009`](https://github.com/pyreon/pyreon/commit/863700940660cacfe517bdb57db2e0dc3ce69da3), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`9ae3ff0`](https://github.com/pyreon/pyreon/commit/9ae3ff0d972bb7525671d49c63a1e50a4aaa9a53), [`e87159b`](https://github.com/pyreon/pyreon/commit/e87159b0724e41d7bf41856f7bf877e49bab1379), [`e224194`](https://github.com/pyreon/pyreon/commit/e224194a911b96d9a758edf86f53d38b87ec2052), [`eac9382`](https://github.com/pyreon/pyreon/commit/eac9382537578805a6550eb78370e13e1ed66574), [`fc30001`](https://github.com/pyreon/pyreon/commit/fc3000145376beb855a3caa659fdaa260f0b15b2), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`e224194`](https://github.com/pyreon/pyreon/commit/e224194a911b96d9a758edf86f53d38b87ec2052), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`79bffbc`](https://github.com/pyreon/pyreon/commit/79bffbc7795aba43950760146152105dec2b389c), [`e290d40`](https://github.com/pyreon/pyreon/commit/e290d404b0f571dd2eb0179056811b19933e7842), [`000ab87`](https://github.com/pyreon/pyreon/commit/000ab8774394bcb25b1d9d7d1ea6f57c48aa0a0f), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`9ae3ff0`](https://github.com/pyreon/pyreon/commit/9ae3ff0d972bb7525671d49c63a1e50a4aaa9a53), [`49f9787`](https://github.com/pyreon/pyreon/commit/49f97872fd338519f91b7860643f77e757a224ba), [`eac9382`](https://github.com/pyreon/pyreon/commit/eac9382537578805a6550eb78370e13e1ed66574), [`2eb07b2`](https://github.com/pyreon/pyreon/commit/2eb07b28dc0f64f5c65a809edc4ffcf2befe703f), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`5f5bedf`](https://github.com/pyreon/pyreon/commit/5f5bedf81133dc6128486b083cdf59b8496c7c29), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`d191e35`](https://github.com/pyreon/pyreon/commit/d191e35e4cca3e11bd38cff2ab39ecd3d2cf2651), [`6ff12da`](https://github.com/pyreon/pyreon/commit/6ff12daac8f97c36ddc5c083810718a551a588f5), [`2a05853`](https://github.com/pyreon/pyreon/commit/2a05853c4e1e2e6a6c5b95b4fdbc7fbf8bf5c9f8), [`5f5bedf`](https://github.com/pyreon/pyreon/commit/5f5bedf81133dc6128486b083cdf59b8496c7c29), [`8637009`](https://github.com/pyreon/pyreon/commit/863700940660cacfe517bdb57db2e0dc3ce69da3), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`e224194`](https://github.com/pyreon/pyreon/commit/e224194a911b96d9a758edf86f53d38b87ec2052), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`af19db0`](https://github.com/pyreon/pyreon/commit/af19db0cdb402d1b95f7b3c04c44fd465f107b80), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`8ffcd44`](https://github.com/pyreon/pyreon/commit/8ffcd4407b4ec02c33d011e2be7d1a3710a91155), [`20110e3`](https://github.com/pyreon/pyreon/commit/20110e389a3816098272d125be1ac8544fe65044), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`e44dcc7`](https://github.com/pyreon/pyreon/commit/e44dcc7124a5617f95ddb69786be262a35280d5f), [`768f104`](https://github.com/pyreon/pyreon/commit/768f104018ced7568dde1c99990a21c273e924ec), [`78f9652`](https://github.com/pyreon/pyreon/commit/78f965269befa8060db6661e9ce586f3d10c5337), [`b5bbce2`](https://github.com/pyreon/pyreon/commit/b5bbce23dcda3b05c17ba7a97eb596b97a10c2de), [`88fe476`](https://github.com/pyreon/pyreon/commit/88fe47672df01382e43a11df50adf579fac16a1a), [`33c8eae`](https://github.com/pyreon/pyreon/commit/33c8eaed5f9123e5932fbd188d9e4b48dcf08240), [`da12179`](https://github.com/pyreon/pyreon/commit/da12179167ebedb7058462e5261a4efc6b2d2435), [`44e0a17`](https://github.com/pyreon/pyreon/commit/44e0a17cc2d11e5ec19c5f34a64fd6a5452facc2), [`9593fbc`](https://github.com/pyreon/pyreon/commit/9593fbc44375cc00f57865790a798bd53e479551), [`24c4019`](https://github.com/pyreon/pyreon/commit/24c4019d3e2527bf063d65d62bf574b00965d1e4), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`d0e57b2`](https://github.com/pyreon/pyreon/commit/d0e57b27ccbf9b4b90521235186a003f3d6bc3ca), [`8ab41a7`](https://github.com/pyreon/pyreon/commit/8ab41a79dda725f7ab4b68b3bd65e91893e4864a), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`62417b9`](https://github.com/pyreon/pyreon/commit/62417b9cf49986e0d35f071a8ce562896eda6706), [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e), [`2bef24d`](https://github.com/pyreon/pyreon/commit/2bef24df3d5c86d709509906d4d1e831357b41c6), [`e506bcf`](https://github.com/pyreon/pyreon/commit/e506bcf796a930094e5f5665b72e7efa4967a62c), [`33c8eae`](https://github.com/pyreon/pyreon/commit/33c8eaed5f9123e5932fbd188d9e4b48dcf08240), [`c12635c`](https://github.com/pyreon/pyreon/commit/c12635c3a9c423ac7b860293b0397583970235dd), [`080752b`](https://github.com/pyreon/pyreon/commit/080752b16be8a67bd0ed51eb25bbe8b3dd134f80), [`33c8eae`](https://github.com/pyreon/pyreon/commit/33c8eaed5f9123e5932fbd188d9e4b48dcf08240), [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e), [`69b6ad5`](https://github.com/pyreon/pyreon/commit/69b6ad5b50760aff91ad9917bdbe00f6aee02a35), [`78b3423`](https://github.com/pyreon/pyreon/commit/78b3423b830ec4c5d60034ae8f468eec111cacf2), [`127e5d6`](https://github.com/pyreon/pyreon/commit/127e5d65cd2a3cea8457a1bd6f397b75c0ad4597), [`687d0eb`](https://github.com/pyreon/pyreon/commit/687d0eb483619c77411ea2385ea1dd702ae6ffce), [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e), [`c7feb0b`](https://github.com/pyreon/pyreon/commit/c7feb0b726ea78ef7b6a4d3a17e8ae85df471a67), [`5a83e86`](https://github.com/pyreon/pyreon/commit/5a83e86c2c1848de9b318e2fd011963f2125cd4d)]:
  - @pyreon/native-compiler@0.52.0
  - @pyreon/reactivity@0.52.0
  - @pyreon/config@0.52.0
