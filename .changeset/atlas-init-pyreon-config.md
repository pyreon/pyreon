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
