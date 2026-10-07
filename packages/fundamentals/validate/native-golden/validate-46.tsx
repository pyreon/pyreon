import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
declare const vs: any
const a = zodSchema(z.discriminatedUnion('kind', vs))
