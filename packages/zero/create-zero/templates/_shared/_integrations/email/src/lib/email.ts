import { Resend } from 'resend'
import { extractDocNode } from '@pyreon/document-primitives'
import { render } from '@pyreon/document'
import type { ComponentFn, Props } from '@pyreon/core'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.EMAIL_FROM ?? 'noreply@example.com'

/**
 * Send an email rendered from a Pyreon `@pyreon/document-primitives`
 * template. The same template renders in the browser preview AND exports
 * to email HTML — that is the headline Pyreon angle: one component tree,
 * many output formats.
 */
export async function sendEmail<TProps extends Props>(opts: {
  to: string | string[]
  subject: string
  template: ComponentFn<TProps>
  data: TProps
}): Promise<{ id: string } | { error: string }> {
  const node = extractDocNode(() => opts.template(opts.data))
  const html = (await render(node, 'email')) as string

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html,
  })

  if (error) return { error: error.message }
  return { id: data?.id ?? 'unknown' }
}
