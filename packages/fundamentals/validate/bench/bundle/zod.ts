import { z } from 'zod'
export const S = z.object({ name: z.string().min(2), age: z.number().int().min(0).max(150), email: z.string().email(), tags: z.array(z.string()) })
export const r = S.safeParse(globalThis)
