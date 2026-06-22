import { type } from 'arktype'
export const S = type({ name: 'string >= 2', age: '0 <= number.integer <= 150', email: 'string.email', tags: 'string[]' })
export const r = S(globalThis)
