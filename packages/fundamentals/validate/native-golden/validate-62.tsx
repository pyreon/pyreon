import { arktypeSchema } from '@pyreon/validation'
import { type } from 'arktype'
const A = arktypeSchema(type({ name: 'string', n: 5, k: 'symbol', ok: 'boolean', [dyn]: 'string' }))
const B = arktypeSchema(type(shapeVar))
const C = arktypeSchema(type({ [only]: 'string' }))
