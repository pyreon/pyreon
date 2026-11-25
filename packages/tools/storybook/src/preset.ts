/**
 * Storybook preset for @pyreon/storybook.
 *
 * This file is loaded by Storybook's server when the user sets
 * `framework: "@pyreon/storybook"` in their `.storybook/main.ts`.
 *
 * It tells Storybook:
 * - Which builder to run (vite — Pyreon apps are vite apps)
 * - Which renderer to use (via the preview entry)
 * - What framework name to report
 *
 * MUST stay ESM-clean: the package is `"type": "module"`, so the built
 * `lib/preset.js` evaluates as ESM where `__dirname` does not exist. The
 * original `join(__dirname, 'preview')` made EVERY consumer `storybook
 * build`/`dev` die at config load (SB_CORE-SERVER_0002
 * CriticalPresetLoadError) — and the source-importing unit test passed
 * throughout, because vitest's transform provides a CJS-interop `__dirname`
 * the shipped ESM never has. The load-bearing test imports the BUILT
 * `lib/preset.js` (see tests/preset.test.ts).
 */

import { previewPathFor } from './preview-path'

export const addons: string[] = []

// Extensionless sibling path: resolves to lib/preview.js next to the built
// preset (and src/preview.ts under the bun condition in-repo). See
// `previewPathFor` for why the scheme is guarded.
const previewUrl = new URL('preview', import.meta.url)
export const previewAnnotations: string[] = [previewPathFor(previewUrl)]

export const core = {
  // Storybook REQUIRES a builder from the framework preset — without it,
  // config load dies with SB_CORE-SERVER_0003 MissingBuilderError the
  // moment the preset itself loads. Named here, resolved from the
  // consumer's install (peer dep, version-aligned with their storybook).
  builder: '@storybook/builder-vite',
  renderer: '@pyreon/storybook',
}
