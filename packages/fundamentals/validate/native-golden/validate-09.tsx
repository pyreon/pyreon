import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const evt = zodSchema(z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('click'), x: z.number() }),
  z.object({ kind: z.literal('key'), code: z.string() }),
]))
