import { s } from '@pyreon/validate'
import { arktypeSchema } from '@pyreon/validation'
import { type } from 'arktype'
const A = s.object({ a: s.string().max(5).optional(), tags: s.array(s.string().min(2).max(9).email().url().uuid().regex(/^a/)).optional(), u: s.array(s.string().email().max(3)), odd: s.array(other.string()), n: s.array(s.number().max(4)).optional() })
const K = arktypeSchema(type({ n: 'number', s: 'string' }))
