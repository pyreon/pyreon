---
'@pyreon/config': minor
'@pyreon/atlas': minor
'@pyreon/cli': patch
---

`pyreon.config.ts`, `atlas init`, and a detector that finds the components people actually write.

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
