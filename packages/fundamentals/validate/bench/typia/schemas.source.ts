/**
 * typia fixtures for the @pyreon/validate comparison benchmark.
 *
 * typia validates from a TYPE at COMPILE time, so its validators cannot be
 * built at runtime like every other library here. This file is the source of
 * truth for the shapes; it is compiled ahead of time with `ttsc` and the
 * emitted plain JS is what the benchmark imports.
 *
 * Two exports per scenario, matching the benchmark's two axes:
 *   is<Name>       — typia.createIs        → boolean verdict
 *   validate<Name> — plain.createValidateClone → { success, data } + errors,
 *                    allocating a STRIPPED clone. This is the honest analogue
 *                    of zod's safeParse; `typia.validate` returns the input by
 *                    reference and would be measuring less work.
 */
import typia, { tags, plain } from 'typia'

type Email = string & tags.Format<'email'>
type Age = number & tags.Type<'int32'> & tags.Minimum<0> & tags.Maximum<150>

// 1 — string.email
export const isStringEmail = typia.createIs<Email>()
export const validateStringEmail = plain.createValidateClone<Email>()

// 2 — number.int.range
export const isNumberRange = typia.createIs<Age>()
export const validateNumberRange = plain.createValidateClone<Age>()

// 3 — object.user
interface User {
  name: string & tags.MinLength<2>
  age: Age
  email: Email
  tags: string[]
}
export const isUser = typia.createIs<User>()
export const validateUser = plain.createValidateClone<User>()

// 4 — array.20-objects
interface NameAge {
  name: string & tags.MinLength<2>
  age: Age
}
export const isNameAgeArray = typia.createIs<NameAge[]>()
export const validateNameAgeArray = plain.createValidateClone<NameAge[]>()

// 5 — object.deep-nested
interface Deep {
  id: number & tags.Type<'int32'>
  user: {
    name: string & tags.MinLength<2>
    address: { city: string & tags.MinLength<1>; zip: string & tags.MinLength<5> & tags.MaxLength<5> }
  }
}
export const isDeep = typia.createIs<Deep>()
export const validateDeep = plain.createValidateClone<Deep>()

// 6 — object.array-of-objects
interface Page {
  page: number & tags.Type<'int32'> & tags.Minimum<0>
  items: { id: number & tags.Type<'int32'>; title: string & tags.MinLength<1>; done: boolean }[]
}
export const isPage = typia.createIs<Page>()
export const validatePage = plain.createValidateClone<Page>()

// 7 — du.3-member
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; w: number; h: number }
  | { kind: 'label'; text: string; size: number }
export const isShape = typia.createIs<Shape>()
export const validateShape = plain.createValidateClone<Shape>()
