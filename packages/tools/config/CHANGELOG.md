# @pyreon/config

## 0.53.0

No changes in this release.

## 0.52.0

### Minor Changes

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

- [#3689](https://github.com/pyreon/pyreon/pull/3689) [`2a85027`](https://github.com/pyreon/pyreon/commit/2a85027c190335e782bd581b5856ae2ef783207d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `remoteRefs: 'fetch'` lets `generate` download the REMOTE parts of a spec on disk (default `'off'` stays offline and reports them), with `lathe pull`'s rules: per-document ETag cache, `remoteHeaders` keyed by origin and sent only there, and a part that cannot be fetched fails the run. A bundled `lathe pull` is now conditional on the root spec too. `api-surface.json` records typed error bodies and the contract diff classifies them (a removed key or changed body is breaking; an added key is breaking only when a range or `default` already covered its status). `mockOperation(id, { status })` answers with the declared, schema-valid error body.

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

### Patch Changes

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

- [#3684](https://github.com/pyreon/pyreon/pull/3684) [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `LatheSection` gains `pagination`, the declared-pagination map that emits `use<Op>Infinite` hooks.

- [#3557](https://github.com/pyreon/pyreon/pull/3557) [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop publishing the build's bundle-analysis report.

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

## 0.51.0

### Minor Changes

- `pyreon.config.ts`, `atlas init`, and a detector that finds the components people actually write. (f7835ed)

  **One config for the ecosystem.** New `@pyreon/config` package: a single
  `pyreon.config.ts` with a typed section per package, instead of a file per tool.

  ```ts
  import { defineConfig } from '@pyreon/config'

  export default defineConfig({
    atlas: { title: 'Acme Design System' },
  })
  ```

  A key appears in the type ONLY when a package actually reads it — a config
  surface advertising options nothing consumes is the typed-but-unimplemented
  class `audit-types` gates against. `atlas` is wired; others land as they are.
  Per-tool files (`atlas.config.ts`) keep working and win where both exist, so a
  half-finished migration never has the general file silently override the
  specific one.

  **Render extensions.** A single `wrapper` could hold one provider — a second
  silently won, so two packages could not both contribute and no package could
  ship its own setup at all. `extensions: [{ name, wrap?, setup? }]` composes:
  `wrap` layers around every scenario (first listed outermost, the order the JSX
  would be written by hand), `setup` runs once at boot for document-level work a
  wrapper cannot reach — a font link, a global stylesheet. Each setup is isolated
  and reported by name on failure, rather than taking the workbench down before
  first paint. `wrapper` still works, composing as the innermost layer.

  **`atlas init`** reads the workspace's own `workspaces` / `pnpm-workspace.yaml`
  declaration, probes each package for components, and writes the config —
  refusing to overwrite an existing one without `--force`, because that file is
  hand-edited the moment it exists. It writes no story files and has no flag to:
  components, controls and scenarios are DERIVED from source.

  **Zero-config monorepos.** When nothing is configured AND the default root has
  no components — today a dead end that prints "no components found" — the
  workspace's packages are detected automatically, and the scan says so rather
  than producing a catalog from nowhere.

  **`atlas check` — the catalog as a guardrail.** Atlas already knew `state`
  accepts exactly three values; that knowledge could only be READ, and reading is
  not checking. The most common failure when an AI writes UI code is a plausible
  prop value that does not exist — `state="primry"` typechecks in a JS file,
  renders without throwing, and silently does nothing. `atlas check Button
'{"state":"primry"}'` catches it and suggests `primary`, plus unknown props,
  wrong types (including a non-function event handler) and missing required props.
  Exits non-zero, so it works in a hook or a CI step. Reads the catalog rather
  than rescanning, so it cannot disagree with the guide an agent was just handed.

  **The props table now documents the CONTRACT, not just the shape.** It showed
  NAME / TYPE / DEFAULT — so an enum read as the word `enum` and you had to open
  the control dropdown to learn what it accepts, and nothing said which props were
  required. Those are the two facts that decide whether a usage is correct, and
  exactly what `atlas check` validates against. Allowed values now render in place
  of the type (`solid | outline`), required props are marked, and a missing
  default renders as `—` rather than the literal text `undefined`.

  **Discovery is no longer silent.** A component the scanner does not recognise
  was pure absence — the catalog quietly one smaller, with nothing distinguishing
  "you have 12 components" from "you have 14 and I found 12". `atlas scan` now
  reports files that export something PascalCase and produced no component, with
  a reason where the shape is a known gap (a class, a re-export, a `styled()`
  call, a member-call chain). Framed as a list to look at, not a failure — a
  provider or a schema belongs there too. Silent on a healthy full scan of the
  workshop example: zero false positives.

  **Skips now say why.** A bare `skip` was three situations wearing one label:
  cannot run here, needs a different command, or nothing looked. `reactivityCoverage`
  and `snapshot` carry `browser-only — run atlas verify-browser`; the static a11y
  check explains that a component with no required name-like prop has nothing it
  can check statically. "2 of 5 skipped" read as a hole in the tool when it was a
  command the user had not run.

  **Imported prop types now resolve** — the largest remaining gap between
  "works" and "usable on a real design system". `import type { ButtonProps } from
'./types'` is what most projects do, and it produced ZERO controls: the
  component was found, its whole contract was not — no knobs, no variant axes, no
  scenarios past the edge cases. Relative imports are followed to the file,
  through barrel re-exports (`export type { X } from './y'`, `export *`) and
  aliased imports. Measured on a fixture: a component went from 0 controls / 2
  edge-case scenarios to a full contract with its variant axis and 6 scenarios.

  Not a type checker, deliberately: `node_modules` is not followed, because
  resolving it needs the real module-resolution algorithm and guessing produces
  confident wrong answers — worse than the honest `unknown` it replaces. Depth-
  bounded and cycle-guarded, so a barrel cycle cannot hang a scan.

  **Detector widened**, each of these previously a silent absence:

  - `export default function Button()`, and anonymous defaults (named after the file)
  - `const Button: ComponentFn<Props> = …` and `nativeCompat(…)` wrappers, plus
    parenthesised and cast forms
  - `.jsx` and `.ts` files — a rocketstyle component is a call chain with no JSX
    in it, so it legitimately lives in a `.ts` file the scanner never opened

  Caught while widening: the first cut unwrapped ANY call expression, which
  matched rocketstyle chains (`chipBase.theme((t) => …)`) and read the theme
  callback as the component's props — cataloguing fabricated props AND suppressing
  the rocketstyle pass that would have found the real axes. Measured on the
  workshop example: 43 scenarios silently became 29. Unwrapping is now restricted
  to bare-identifier callees, and the regression is locked by a test.

  Also fixed: `lazy(() => import('./Heavy'))` catalogued the lazy BOUNDARY as a
  propless component — a zero-parameter function is a component at the top level
  but a thunk when it is an argument.

  Also fixed: the workspace probe counted FILES, so once `.ts` joined the scanned
  extensions a package of `math.ts` utilities read as "has components" and earned
  an empty sidebar group. It parses now.

- `@pyreon/config` gets a manifest, so it stops being invisible to every (7dc7403)
  documentation and AI surface.

  It shipped on the no-manifest exempt list, reasoned about as "build-time config
  shape, no runtime API" — the same bucket as `@pyreon/typescript`. That
  comparison does not hold: `@pyreon/typescript` ships presets a project
  REFERENCES from `tsconfig.json`, while `@pyreon/config` ships `defineConfig`,
  `CONFIG_FILENAMES` and `sectionFrom`, which a project (and every Pyreon config
  loader) IMPORTS. It is a consumable API, and exempting it meant a newly
  published package with no `llms.txt` line, no MCP api-reference entry, and no
  reference page — for a file users are expected to write by hand.

  The manifest restores all three from one source, and the stale
  `NO_MANIFEST_EXEMPT` entry is removed (the tier gate flags that as stale the
  moment a manifest appears, which is how it was caught).

- `@pyreon/loom` reads its settings from the ecosystem-wide `pyreon.config.*`, (f35927f)
  and `@pyreon/config` gains the `loom` section that describes them.

  ```ts
  export default defineConfig({
    loom: {
      devPaths: ['src/manifest.ts', '**/*.gen.ts'],
      ignore: [
        {
          dep: 'sharp',
          code: 'unused-dep',
          reason: 'loaded by the image plugin',
        },
      ],
      strict: true,
      severity: { 'unused-dep': 'info', 'phantom-dep': 'error' },
    },
  })
  ```

  Two homes, one shape. The root `package.json`'s `loom` key predates the shared
  file, still works, and wins **per key** — mirroring how `atlas.config.*` beats
  `pyreon.config.*`. Per-key rather than whole-object so a project mid-migration
  can move one setting at a time without the manifest silently blanking
  everything it does not mention.

  Both homes go through ONE validator. Two would let one home accept what the
  other rejects — a config that works until you move it.

  `severity` is the adoption lever: raise a code to `error` once it is clean,
  lower one to `info` while it is being burned down, the same ratchet this repo
  runs its lint backlogs on. An unknown code is rejected **with the list of real
  ones**, and severity is applied BEFORE suppressions so an explicit `ignore`
  still has the last word — a deliberate wave-through should not be resurrected
  by a blanket raise.

  A config file that exists but cannot be loaded is a NAMED error, never a silent
  skip. `loom scan` has no bundler (vite is an optional peer used only by
  `loom dev`), so a TypeScript config needs a runtime that strips types — the
  message says so and points at `pyreon.config.mjs` or the manifest key.

  Bisect-verified: flip the precedence → the per-key spec fails; apply severity
  after suppressions → the ignore-wins spec fails. Suite 119/119.
