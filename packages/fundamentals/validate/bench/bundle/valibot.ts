import * as v from 'valibot'
export const S = v.object({ name: v.pipe(v.string(), v.minLength(2)), age: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)), email: v.pipe(v.string(), v.email()), tags: v.array(v.string()) })
export const r = v.safeParse(S, globalThis)
