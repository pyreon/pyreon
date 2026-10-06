import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
declare const q: any
const a = zodSchema(q.x.object({n:z.string()}))
