import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
const a = zodSchema(z.object({ n: z.number().optional(), b: z.boolean().optional() }))
