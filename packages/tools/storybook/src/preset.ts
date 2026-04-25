/**
 * Storybook preset for @pyreon/storybook.
 *
 * This file is loaded by Storybook's server when the user sets
 * `framework: "@pyreon/storybook"` in their `.storybook/main.ts`.
 *
 * It tells Storybook:
 * - Which renderer to use (via the preview entry)
 * - What framework name to report
 */

import { join } from 'node:path'

export const addons: string[] = []

export const previewAnnotations: string[] = [join(__dirname, 'preview')]

export const core = {
  renderer: '@pyreon/storybook',
}
