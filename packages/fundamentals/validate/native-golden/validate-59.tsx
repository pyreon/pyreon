import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
declare const foo: any
const a = zodSchema(foo())
