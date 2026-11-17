import { blog } from '../../blog'

/** /blog/<slug> — one page per published post. */
export const getStaticPaths = blog.postPaths
export default blog.PostPage

/**
 * Fixture-only (scripts/scaffold-cpa-fixtures.ts): build-time ISR, every hour.
 * The SSG plugin writes this value into `dist/_pyreon-revalidate.json` for
 * every prerendered post URL; verify-modes asserts those entries.
 * Must be an inline literal: the build-time extractor does not follow identifiers.
 */
export const revalidate = 3600
