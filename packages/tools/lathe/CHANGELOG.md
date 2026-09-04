# @pyreon/lathe

## 0.52.0

### Minor Changes

- A generated query hook now derives `enabled` from its arguments, and the run report says what actually changed. (dd61b84)

  **`args` may return `undefined` to mean "not ready".** The most common way to get a detail query wrong is to fire it before its id exists — and the natural workaround was to pass a placeholder id AND a matching `enabled` option, the same condition written twice, where getting the second one wrong requests `/books/` with an empty segment and 404s on first paint. The example's own call site carried exactly that, with a comment explaining it. Returning `undefined` now says it once:

  ```ts
  const detail = useGetBook(() => {
    const id = selected();
    return id === undefined ? undefined : { params: { bookId: id } };
  });
  ```

  The disabled branch keys on the endpoint's own `key.prefix`, so an invalidation still matches it. A caller's `enabled: false` still disables; a caller's `enabled: true` cannot fire a request whose path parameter is missing. The type widens (`Args` → `Args | undefined`), so existing call sites are unaffected.

  **The report distinguishes created / updated / unchanged.** It used to mark every file with a green `+` and then print "1 file(s) written" underneath — fourteen lines reading as "created" for one file that actually moved. Now `+` is new, `~` is updated, unchanged files are dimmed, and the count names its denominator.

- Make the Atlas story actually automated: previews, scenarios and a wrapper, all (69c191f)
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

- Lathe's HTTP client is now selectable: `client: 'pyreon' | 'fetch' | 'axios' | 'ky'`. (3f29f0c)

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

- Composable output: layered entry points, a `sideEffects` marker, and two new plugins. (a22bb6d)

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

- Lathe now detects breaking contract changes between spec revisions. (dd61b84)

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

- Add a Vite plugin, watch mode, a generated barrel and a query-key registry. (69c191f)

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

- Lathe now generates a native data component for an operation with a PATH PARAMETER, taking the parameter as a prop. (dd61b84)

  `GET /books/{bookId}` previously produced no native component at all — lathe skipped any operation with a path param, because PMTC resolved the endpoint URL to a compile-time constant. The generated native surface therefore covered collection endpoints only, which is the less useful half of an API.

  PMTC now lowers a runtime `:param` through `useQuery`, whose native harness is keyed on the resulting URL and so re-fetches when the value changes. The emitted component takes the parameter as a prop and reads it as `props.x` — never a destructure, which would freeze the value and stop the query re-fetching.

  On the bookshelf example this takes native reach from 2/4 to 3/4 operations, with both generated modules verified `lowers` on Swift and Kotlin.

  Requires the PMTC change that makes a runtime path param lowerable; lathe's own verifier reports the components as `web-only` without it.

- Add multi-project generation, and make the native layout follow the plugin (69c191f)
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

- `lathe pull <url>` fetches a remote spec into the repo, and `bun run bench` measures the generator's scaling. (dd61b84)

  **`pull` is a separate step on purpose.** The obvious design — let `input` be a URL and fetch during generation — makes output depend on a server's mood: two developers generate different clients from the same commit, `check` fails in CI for reasons nobody can reproduce, and an offline build stops working. So `pull` lands the spec on disk, you review the diff, and every later `generate` reads that file. The spec becomes a reviewable artifact rather than an invisible input — which is also what a contract diff needs, since it compares against a committed baseline.

  It parses before it writes: a 200 carrying an HTML error page or a login redirect leaves an existing working spec untouched, rather than turning a transient network problem into a committed one.

  **The bench answers a question that was previously unanswerable.** Lathe is LINEAR — a least-squares fit over four sizes and three dependency-graph shapes gives a `generate` exponent of 0.94–1.03 at R² 0.998–1.000 — and an 800-model / 1600-operation spec generates in ~25ms. The harness warms up, repeats, takes the median, reports inter-quartile spread, and refuses to state an exponent when the fit or the samples do not support one.

- Add `@pyreon/lathe` — spec-to-client code generation for the Pyreon stack. (69c191f)

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

- The schema library is selectable too: `validator: 'pyreon' | 'zod'` (and (3f29f0c)
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

- Generated docs front-matter now escapes the way YAML actually does, so a spec (a22bb6d)
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

### Patch Changes

- Three defects found auditing the changes since 0.51.0. (5493aa8)

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

- Fix two defects in generated schemas, and remove a quadratic from the emitter. (69c191f)

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

- Stop spec-controlled strings injecting code into generated files. (69c191f)

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

- Expand a plugin selection along the import edges of the emitted code. (69c191f)

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

- Fix four emit bugs found by running GitHub's OpenAPI document through the (69c191f)
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

- Closes every open finding from the lint audit, and adds the leak class nothing (ec0aff6)
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

- Role-aware rule tiers — one config now covers server, client, isomorphic and (ec0aff6)
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

- Updated dependencies:
  - @pyreon/native-compiler@0.52.0
  - @pyreon/reactivity@0.52.0
  - @pyreon/config@0.52.0
