import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
declare const sh: any
const a = zodSchema(z.object(sh))
