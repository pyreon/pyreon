import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
const a = zodSchema(z.discriminatedUnion('kind', [z.object({ kind: z.literal('a'), x: z.string() }), z.object({ kind: z.literal('b'), y: z.number() })]))
