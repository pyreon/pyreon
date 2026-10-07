import { z } from 'zod'
import { zodSchema } from '@pyreon/validation'
export const S = zodSchema(z.discriminatedUnion('operator', [
  z.object({ operator: z.literal('a'), x: z.string() }),
  z.object({ operator: z.literal('b'), x: z.string() }),
]))
