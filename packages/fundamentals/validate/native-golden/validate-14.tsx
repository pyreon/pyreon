import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
const a = zodSchema(z.object({ addr: z.object({ city: z.string() }).optional() }))
