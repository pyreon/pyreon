import { arktypeSchema } from '@pyreon/validation'
declare const type: any
declare const ns: any
const a = arktypeSchema(ns.type({ n: 'string' }))
