/**
 * The ONE validator shape, shared verbatim by every framework impl.
 *
 * Fairness rule (METHODOLOGY.md §"same validator across all"): the schema
 * is identical for Pyreon (`@pyreon/validation` zod adapter) and React Hook
 * Form (`@hookform/resolvers/zod`), so a validation scenario measures the
 * library's WIRING (subscription / re-render / signal patch), not the cost
 * of the rules themselves.
 *
 * All fields are text inputs (string values) so the keystroke-driving is
 * uniform across frameworks. Formats are validated with `regex`/`min`/`max`
 * only (no `.email()` / `.coerce`) so the shape is robust across zod 3 and 4
 * and identical work for both resolvers.
 */
import { z } from 'zod'

/** 12-field registration form — the realistic "medium" size from the plan. */
export const FIELD_NAMES = [
  'first',
  'last',
  'email',
  'phone',
  'street',
  'city',
  'zip',
  'country',
  'age',
  'username',
  'password',
  'bio',
] as const

export type FieldName = (typeof FIELD_NAMES)[number]
export type FormValues = Record<FieldName, string>

export const formSchema = z.object({
  first: z.string().min(1, 'Required'),
  last: z.string().min(1, 'Required'),
  email: z.string().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Invalid email'),
  phone: z.string().min(7, 'Too short'),
  street: z.string().min(1, 'Required'),
  city: z.string().min(1, 'Required'),
  zip: z.string().regex(/^\d{5}$/, '5 digits'),
  country: z.string().min(2, 'Required'),
  age: z.string().regex(/^\d{1,3}$/, 'Number'),
  username: z.string().min(3, 'Min 3'),
  password: z.string().min(8, 'Min 8'),
  bio: z.string().max(500, 'Max 500'),
})

export const emptyValues = (): FormValues =>
  Object.fromEntries(FIELD_NAMES.map((n) => [n, ''])) as FormValues

/** A fully-valid value set — used by scenarios that need a non-error state. */
export const validValues = (): FormValues => ({
  first: 'Ada',
  last: 'Lovelace',
  email: 'ada@example.com',
  phone: '5551234',
  street: '1 Analytical Engine Way',
  city: 'London',
  zip: '12345',
  country: 'UK',
  age: '36',
  username: 'ada',
  password: 'enigma88',
  bio: 'Pioneer of programming.',
})
