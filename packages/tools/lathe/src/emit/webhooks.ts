/**
 * `webhooks.ts` — the requests an API SENDS: 3.1 `webhooks` and operation
 * `callbacks`.
 *
 * A client never makes these calls, so they get no endpoint and no hook. What
 * the code RECEIVING them needs is the payload's schema -- to validate an
 * untrusted body -- and its type, to write a handler against. Both come from
 * the same walk as every other schema, so they cannot disagree:
 *
 * ```ts
 * import { webhookSchemas, type WebhookHandler } from './gen'
 *
 * const onNewPet: WebhookHandler<'newPet'> = (pet) => console.log(pet.name)
 *
 * app.post('/hooks/new-pet', async (req) => {
 *   const result = await webhookSchemas.newPet['~standard'].validate(await req.json())
 *   if (!result.issues) await onNewPet(result.value)
 * })
 * ```
 *
 * Keyed by the webhook's NAME as a string (a callback is
 * `<operationId>.<callbackName>`), never turned into identifiers: a name is
 * whatever the spec author wrote, and one keyed object cannot collide with a
 * model the way a `NewPetPayload` per webhook could.
 */
import type { IrDocument } from '../core/ir'
import { type ValidatorName } from '../core/config'
import { schemaExpr, schemaRefs, schemaSpecifierFor } from './schema'
import { dialectOf } from './validator'
import { SourceFile, q, safeBlockComment } from './writer'

export const WEBHOOKS_FILE = 'webhooks.ts'

/** `webhooks.ts`, or `null` when the spec declares no webhook or callback. */
export function emitWebhooks(doc: IrDocument, validator: ValidatorName): SourceFile | null {
  const hooks = doc.webhooks ?? []
  if (hooks.length === 0) return null
  const dialect = dialectOf(validator)
  const f = new SourceFile(WEBHOOKS_FILE)
  const refs = new Set<string>()
  for (const w of hooks) if (w.payload) schemaRefs(w.payload, refs)
  for (const name of [...refs].sort()) f.import(schemaSpecifierFor(WEBHOOKS_FILE, name, doc), name)
  const withPayload = hooks.filter((w) => w.payload !== undefined)
  const exprs = withPayload.map((w) => schemaExpr(w.payload as NonNullable<typeof w.payload>, { native: false, validator }))
  if (exprs.some((e) => new RegExp(`\\b${dialect.binding}\\.`).test(e))) f.import(dialect.module, dialect.binding)
  const infer = (t: string): string => (dialect.typeHelper ? `${dialect.typeHelper.name}<${t}>` : `${dialect.binding}.infer<${t}>`)
  if (dialect.typeHelper) f.importType(dialect.typeHelper.module, dialect.typeHelper.name)
  else if (!exprs.some((e) => new RegExp(`\\b${dialect.binding}\\.`).test(e))) f.importType(dialect.module, dialect.binding)
  f.line()
  f.doc(
    'Schemas for the payloads this API SENDS (webhooks and callbacks), keyed by name.',
    'Validate an incoming body with `webhookSchemas[name][\'~standard\'].validate(body)`.',
  )
  f.line('export const webhookSchemas = {')
  withPayload.forEach((w, i) => {
    const describe = [
      w.kind === 'callback' ? `Callback \`${w.method}\`${w.expression ? ` to \`${w.expression}\`` : ''}` : `Webhook \`${w.method}\``,
      w.summary,
    ].filter(Boolean)
    f.line(`  /** ${safeBlockComment(describe.join(' — ').replace(/\s+/g, ' '))} */`)
    f.line(`  ${q(w.name)}: ${exprs[i]},`)
  })
  f.line('} as const')
  f.line()
  f.doc('The payload of each webhook / callback — `undefined` for one that sends no body.')
  f.line('export interface WebhookPayloads {')
  for (const w of hooks) {
    f.line(`  ${q(w.name)}: ${w.payload ? infer(`typeof webhookSchemas[${q(w.name)}]`) : 'undefined'}`)
  }
  f.line('}')
  f.line()
  f.doc('A handler for one webhook or callback, typed by its payload.')
  f.line('export type WebhookHandler<K extends keyof WebhookPayloads> = (payload: WebhookPayloads[K]) => void | Promise<void>')
  return f
}
