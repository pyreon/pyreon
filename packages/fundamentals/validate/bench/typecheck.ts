// Empirical type-inference equality check across the 4 libs. tsc errors = inference gap.
import { z } from 'zod'
import * as v from 'valibot'
import { type } from 'arktype'
import { s, type Infer } from '../src/v1'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<T extends true> = T
type Want = { name: string; age: number; email: string; tags: string[] }

const P = s.object({ name: s.string().min(2), age: s.number().int().min(0).max(150), email: s.string().email(), tags: s.array(s.string()) })
const Z = z.object({ name: z.string().min(2), age: z.number().int().min(0).max(150), email: z.string().email(), tags: z.array(z.string()) })
const V = v.object({ name: v.pipe(v.string(), v.minLength(2)), age: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)), email: v.pipe(v.string(), v.email()), tags: v.array(v.string()) })
const A = type({ name: 'string >= 2', age: '0 <= number.integer <= 150', email: 'string.email', tags: 'string[]' })

// exact bidirectional equality vs Want — any inference drift fails tsc
type _P = Expect<Equal<Infer<typeof P>, Want>>
type _Z = Expect<Equal<z.infer<typeof Z>, Want>>
type _V = Expect<Equal<v.InferOutput<typeof V>, Want>>
type _A = Expect<Equal<typeof A.infer, Want>>

// optional-key handling: optional field must be `?:` not just `| undefined`
const PO = s.object({ a: s.string(), b: s.string().optional() })
type WantOpt = { a: string; b?: string | undefined }
type _PO = Expect<Equal<Infer<typeof PO>, WantOpt>>

// transform in/out divergence: number -> string
const PT = s.number().transform((n) => String(n))
type _PT = Expect<Equal<Infer<typeof PT>, string>>

// brand phantom typing
const PB = s.string().brand<'UserId'>()
type _PB = Expect<Equal<Infer<typeof PB>, string & { readonly __brand: 'UserId' }>>

