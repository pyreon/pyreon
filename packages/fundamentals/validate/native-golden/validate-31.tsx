import { z } from 'zod'
import { zodSchema } from '@pyreon/validation'
export const Filter = zodSchema(z.object({ operator: z.string(), where: z.string().optional() }))
