import { z } from 'zod'
import { zodSchema } from '@pyreon/validation'
export const S = zodSchema(z.object({ operator: z.string(), where: z.string(), class: z.string(), in: z.string(), 'my-key': z.string() }))
