// Gap 4 follow-up fixture — @pyreon/validation v1 (Zod-schema port).
//
// v1 contract: top-level `const X = zodSchema(z.object({ ... }))`
// with simple field shapes (z.string / z.number / z.boolean).
// Modifier chains (.min/.max/.email/...) are accepted at AST level
// but constraints are NOT enforced in v1 emit (shape only).
//
// Apps validate at JSON-decode time via Codable (Swift) /
// kotlinx.serialization (Kotlin); v2 follow-up will emit runtime
// .parse() / .safeParse() methods with constraint enforcement.

import { zodSchema } from '@pyreon/validation'

declare const z: {
  object: <T>(shape: T) => unknown
  string: () => { min(n: number): unknown; max(n: number): unknown; email(): unknown }
  number: () => { min(n: number): unknown; max(n: number): unknown }
  boolean: () => unknown
}

export const userSchema = zodSchema(
  z.object({
    name: z.string(),
    email: z.string().min(5).max(254).email(),
    age: z.number().min(0).max(150),
    active: z.boolean(),
  }),
)
