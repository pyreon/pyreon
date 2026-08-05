/**
 * Where an explicit `--out` lands.
 *
 * Its own module rather than a helper in `run.ts`, because `src/cli.ts` is
 * `export * from './cli/run'` — anything exported there becomes part of
 * `@pyreon/atlas/cli`'s public surface, and this is an argv detail, not an API.
 * The test imports it from here instead.
 */
import { resolve } from 'node:path'

/**
 * Make an explicit `--out` absolute, against the shell's cwd.
 *
 * `atlas build [dir] --out <path>` takes a project directory AND an output
 * path, and `buildStatic` resolves a relative `out` against its own `cwd`
 * option — correct for a programmatic caller that passes both, wrong for
 * someone typing a path. Standing at a repo root,
 *
 *   atlas build packages/ui/components --out docs/dist/atlas
 *
 * means `./docs/dist/atlas`. It used to emit into
 * `packages/ui/components/docs/dist/atlas` — silently, and with a success
 * message naming the wrong directory, which is how it reached a CI workflow.
 * Every other CLI (tsc, storybook, esbuild) reads an output path against the
 * cwd.
 *
 * Only an EXPLICIT value is rewritten. The DEFAULT (`atlas-dist`) is a path the
 * tool chose, not one a user typed, and it belongs beside the project it
 * documents — the same place `atlas scan` writes `atlas-catalog.json`.
 */
export function resolveOut(value: string | undefined): string | undefined {
  return value === undefined ? undefined : resolve(value)
}
