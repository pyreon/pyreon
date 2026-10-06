import { zodSchema, valibotSchema, arktypeSchema } from '@pyreon/validation'
import { z } from 'zod'
import * as v from 'valibot'
const base = z.string()
const A = zodSchema(base)
const B = valibotSchema(vb)
const C = arktypeSchema(ab)
export const D = zodSchema(z.object({ n: z.string() }))
