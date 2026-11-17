/**
 * `InferSchemaOutput` types `entry.data` in the generated
 * `.pyreon/content-types.d.ts`. It must resolve to the schema's OUTPUT for
 * both shapes a Standard Schema can take: one carrying the optional
 * `~standard.types` phantom (zod / valibot / arktype) and one exposing only
 * `validate` (`@pyreon/validate`'s `s`). Checked by `tsc` (typecheck), not at
 * runtime.
 */
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expectTypeOf, it } from 'vitest'
import type { BlogPostData, BlogSchema } from '../blog/schema'
import type { InferSchemaOutput } from '../schema'

interface Post {
  title: string
  tags: string[]
}

describe('InferSchemaOutput', () => {
  it('reads the output of a spec-typed schema', () => {
    expectTypeOf<InferSchemaOutput<StandardSchemaV1<unknown, Post>>>().toEqualTypeOf<Post>()
  })

  it('reads the success branch of `validate` when there is no `types` phantom', () => {
    interface ValidateOnly {
      readonly '~standard': {
        readonly version: 1
        readonly vendor: 'pyreon'
        readonly validate: (
          value: unknown,
        ) =>
          | { readonly value: Post; readonly issues?: undefined }
          | { readonly value?: undefined; readonly issues: ReadonlyArray<StandardSchemaV1.Issue> }
      }
    }
    expectTypeOf<InferSchemaOutput<ValidateOnly>>().toEqualTypeOf<Post>()
  })

  it('reads the blog schema output', () => {
    expectTypeOf<InferSchemaOutput<BlogSchema>>().toEqualTypeOf<BlogPostData>()
  })
})
