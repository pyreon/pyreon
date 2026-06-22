import { s } from '../../src/v1'
export const S = s.object({ name: s.string().min(2), age: s.number().int().min(0).max(150), email: s.string().email(), tags: s.array(s.string()) })
export const r = S.parse(globalThis)
