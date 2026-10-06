import { valibotSchema } from '@pyreon/validation'
import * as v from 'valibot'
declare const safeParse: <T>(s: unknown, i: unknown) => T
export const itemSchema = valibotSchema(v.object({ id: v.string(), bad: v.date() }), safeParse)
