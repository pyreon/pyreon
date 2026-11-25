/**
 * `@pyreon/storybook/internal` — NOT public API.
 *
 * Test seams for the preset. Nothing here carries a semver promise: any export
 * may change or disappear in any release (see "What counts as public API" on
 * the stability page, docs/src/content/docs/stability-and-direction.md).
 * Application code and Storybook configs must not import from this subpath.
 */
export { previewPathFor } from './preview-path'
