import { s } from '@pyreon/validate'
const A = s.object({ tags: s.array(s.date()), n: s.array(s.number().int()), m: s.array(s.number().min(1)), o: s.array(s.object({ p: s.number() })) })
