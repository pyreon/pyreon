# @pyreon/config

## 0.52.0

### Minor Changes

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

### Patch Changes

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

## 0.51.0

### Minor Changes

- `pyreon.config.ts`, `atlas init`, and a detector that finds the components people actually write. (f7835ed)

  **One config for the ecosystem.** New `@pyreon/config` package: a single
  `pyreon.config.ts` with a typed section per package, instead of a file per tool.

  ```ts
  import { defineConfig } from "@pyreon/config";

  export default defineConfig({
    atlas: { title: "Acme Design System" },
  });
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
      devPaths: ["src/manifest.ts", "**/*.gen.ts"],
      ignore: [
        {
          dep: "sharp",
          code: "unused-dep",
          reason: "loaded by the image plugin",
        },
      ],
      strict: true,
      severity: { "unused-dep": "info", "phantom-dep": "error" },
    },
  });
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
