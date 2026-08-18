/**
 * Which `pyreon()` options cross into the nested SSR/SSG sub-build.
 *
 * ── The bug this closes ───────────────────────────────────────────────────
 *
 * `mode: 'ssg' | 'ssr' | 'isr'` runs a nested Vite build over the same user
 * source. It cannot forward the outer `pyreon` plugin INSTANCE — a second
 * `configResolved` on the same object rewrites captured output paths, which is
 * why `RE_ADDED_PLUGIN_NAMES` filters it out (`ssr-build-shared.ts`). So the
 * inner chain constructs a fresh one, and for a long time did it as a bare
 * `pyreon()`: every transform option the user set applied to the client graph
 * and silently did NOT apply to the SSR graph.
 *
 * `ssrTemplate` is the sharpest case. It shapes only the SSR emit, so the SSR
 * pass is the one place it does anything — and the one place it was dropped.
 * `pyreon({ ssrTemplate: false })` in an SSG app was a no-op, which is not a
 * theory: `@pyreon/loom`'s static-site build hit it and had to carry a comment
 * saying so.
 *
 * ── Why an explicit split, not "forward everything" ───────────────────────
 *
 * Blind forwarding breaks the build. `ssr: { entry }` makes the plugin's
 * `config()` return `build.rollupOptions.input = entry`, and a plugin's
 * `config()` return BEATS the inline `build({ … })` argument in Vite's merge
 * order (the PR #1395 trap, documented at the `innerZeroConfig` site). The
 * inner build would compile the user's own server entry instead of the
 * synthetic one zero wrote, in a directory zero controls. So the set has to be
 * chosen, and each choice has to be justified.
 *
 * ── Why a Record, not a list ──────────────────────────────────────────────
 *
 * An allowlist array reproduces the bug on the next option: whoever adds one
 * to `PyreonPluginOptions` gets a silent non-forward, exactly the failure mode
 * above (`.claude/rules/anti-patterns.md`, "gate input list is a silent-hole
 * generator"). `Record<keyof Required<PyreonPluginOptions>, …>` makes a missing
 * key a TYPECHECK ERROR and an unknown key a typecheck error too, so a new
 * option cannot be added without classifying it. The default stops being
 * "silently inherit the wrong thing" and becomes "the build won't compile until
 * you decide".
 */
import type { PyreonPluginApi, PyreonPluginOptions } from '@pyreon/vite-plugin'
import type { Plugin } from 'vite'

/**
 * Per-option decision. `Record` over `keyof Required<…>` is load-bearing: it is
 * what forces a new option to be classified rather than silently dropped.
 *
 * `forward` — the option shapes how USER SOURCE is transformed, so the inner
 * build has to agree with the outer or the two graphs compile differently.
 *
 * `drop` — the option describes the OUTER build's shape or the dev server, and
 * would either mis-steer the sub-build or do nothing in it.
 */
export const INNER_PYREON_OPTION_DISPOSITION: Record<
  keyof Required<PyreonPluginOptions>,
  'forward' | 'drop'
> = {
  /** Import aliasing (`react` → `@pyreon/react-compat`). The SSR pass compiles
   *  the same imports; without it they resolve differently or not at all. */
  compat: 'forward',
  /** Shapes only the SSR emit — the whole reason this module exists. */
  ssrTemplate: 'forward',
  /** Island discovery + the registry virtual module. The SSR graph renders the
   *  island markers, so it must see the same declarations. */
  islands: 'forward',
  /** Injects imports into user `.tsx`. Same files, so same injection. */
  jsxAutoImport: 'forward',
  /** Build-only source rewrites; the SSR graph should carry them too. */
  compileValidators: 'forward',
  optimizeValidators: 'forward',

  /** DROP — the plugin's `config()` would set `build.rollupOptions.input` to
   *  the user's server entry, replacing zero's synthetic one. A plugin's
   *  `config()` return beats the inline `build({ … })` arg, so this does not
   *  merely add an entry: it takes over the sub-build. */
  /** CLIENT emit only — the compiler ignores it under `ssr: true`, so the inner
   *  SSR sub-build gets nothing from it. Forwarding would be strictly worse
   *  than useless: while the option is on the compiler falls back to its JS
   *  backend (no native mirror yet), so the sub-build would pay the 3.7-8.9x
   *  slower transform across every file for zero effect. Same reasoning as
   *  `collapse`, which is also a client-only build-time transform. */
  templatizeComponentChildren: 'drop',
  ssr: 'drop',
  /** DROP — collapse is CLIENT-graph-only by design (gated `isBuild && !isSsr`
   *  in the plugin), so it would no-op here anyway; and it spawns its own
   *  nested Vite SSR build to resolve wrappers, which is not something to start
   *  from inside a nested build for zero gain. */
  collapse: 'drop',
  /** DROP — dev-server-only injection. A build never injects the LPIH bridge. */
  lpih: 'drop',
  /** DROP — dev-only throw-time script injection. */
  devErrorPrinter: 'drop',
}

const FORWARDED = Object.freeze(
  (Object.keys(INNER_PYREON_OPTION_DISPOSITION) as Array<keyof PyreonPluginOptions>).filter(
    (k) => INNER_PYREON_OPTION_DISPOSITION[k] === 'forward',
  ),
)

/**
 * Read the outer `pyreon` plugin's options off a resolved plugin array.
 *
 * Matched by plugin NAME (`pyreon` — the plugin's name, not the package's) and
 * read from its `api`. Returns `{}` when the plugin is absent or predates the
 * `api` field: a bare-`pyreon()` inner build is exactly the old behaviour, so
 * the fallback is the status quo rather than a throw.
 */
export function readOuterPyreonOptions(
  plugins: readonly Plugin[] | undefined,
): PyreonPluginOptions {
  for (const p of plugins ?? []) {
    if (typeof p !== 'object' || p === null || p.name !== 'pyreon') continue
    const api = (p as { api?: unknown }).api
    if (typeof api !== 'object' || api === null) continue
    const opts = (api as Partial<PyreonPluginApi>).pyreonOptions
    if (typeof opts === 'object' && opts !== null) return opts
  }
  return {}
}

/**
 * The subset of `outer` that may cross into the nested build.
 *
 * Only keys the user actually SET are copied — an explicit `undefined` is left
 * out so the inner plugin applies its own default rather than seeing a present
 * key whose value is `undefined` (the repo runs `exactOptionalPropertyTypes`,
 * and the two are not the same thing).
 */
export function pickInnerPyreonOptions(outer: PyreonPluginOptions): PyreonPluginOptions {
  const inner: Record<string, unknown> = {}
  for (const key of FORWARDED) {
    const value = outer[key]
    if (value !== undefined) inner[key] = value
  }
  return inner as PyreonPluginOptions
}

/** Convenience: read the outer options off a plugin array and pick the subset. */
export function innerPyreonOptions(plugins: readonly Plugin[] | undefined): PyreonPluginOptions {
  return pickInnerPyreonOptions(readOuterPyreonOptions(plugins))
}
