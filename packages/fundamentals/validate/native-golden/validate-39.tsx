import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
const a = zodSchema(z.object({ t: z.array(z.boolean()) }))
