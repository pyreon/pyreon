/**
 * Drift LOCK: zero's fs-route convention functions ARE the shared
 * `@pyreon/compiler/fs-route-convention` implementations — asserted by
 * IDENTITY, not behavioral equivalence.
 *
 * History: `@pyreon/compiler`'s project scanner carried comment-synced
 * ("Mirrors …") COPIES of `filePathToUrlPath` / `isApiRoute` /
 * `apiFilePathToPattern` that had already diverged at birth — its
 * `isApiRouteFile` accepted `/api/` at ANY depth while zero's `isApiRoute`
 * requires the top-level `api/` prefix, so a nested `posts/api/x.ts` was
 * reported as an API route zero NEVER serves. The fix moved the pure
 * convention functions into `@pyreon/compiler` (the lowest shared layer —
 * same one-source-of-truth shape as `scripts/test-paths.ts`) with zero
 * re-exporting them.
 *
 * If someone reintroduces a local copy in `fs-router.ts` / `api-routes.ts`,
 * these identity assertions fail even when the copy is byte-identical that
 * day — which is the point: a second home is where drift starts. Zero's full
 * fs-router / api-routes behavioral suites keep running against the
 * re-exports, so semantics stay locked on this side too.
 */
import {
  apiFilePathToPattern as sharedApiFilePathToPattern,
  filePathToUrlPath as sharedFilePathToUrlPath,
  isApiRoute as sharedIsApiRoute,
} from '@pyreon/compiler/fs-route-convention'
import { describe, expect, it } from 'vitest'
import { apiFilePathToPattern, isApiRoute } from '../api-routes'
import { filePathToUrlPath } from '../fs-router'

describe('fs-route convention is single-sourced from @pyreon/compiler (drift lock)', () => {
  it('zero re-exports ARE the shared functions — identity, not equivalence', () => {
    expect(isApiRoute).toBe(sharedIsApiRoute)
    expect(apiFilePathToPattern).toBe(sharedApiFilePathToPattern)
    expect(filePathToUrlPath).toBe(sharedFilePathToUrlPath)
  })

  it('the divergence shape that motivated the extraction stays fixed', () => {
    // Nested api dir: a PAGE route in zero — the scanner's old copy called
    // this an API route. Locked here from zero's side of the seam as well.
    expect(isApiRoute('posts/api/x.ts')).toBe(false)
    expect(sharedFilePathToUrlPath('posts/api/x')).toBe('/posts/api/x')
    // Top-level api/ is the one-and-only API route home.
    expect(isApiRoute('api/posts.ts')).toBe(true)
    expect(apiFilePathToPattern('api/posts/[id].ts')).toBe('/api/posts/:id')
  })
})
