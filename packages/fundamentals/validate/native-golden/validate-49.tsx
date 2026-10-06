import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
declare const w: any
const a = zodSchema(z.discriminatedUnion('kind', [w.object({ kind: z.literal('a') })]))
