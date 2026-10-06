import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
const a = zodSchema(z.object({n:z.string()})), b = zodSchema(z.object({m:z.string()}))
