import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
declare const vv: any
const a = zodSchema(z.discriminatedUnion('kind', [vv]))
