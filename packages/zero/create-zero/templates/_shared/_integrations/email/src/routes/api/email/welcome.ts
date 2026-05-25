import { sendEmail } from '../../../lib/email'
import WelcomeEmail from '../../../emails/welcome'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const to = url.searchParams.get('to')
  if (!to) {
    return new Response(JSON.stringify({ error: 'Missing ?to=' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const appUrl = url.origin

  const result = await sendEmail({
    to,
    subject: 'Welcome',
    template: WelcomeEmail,
    data: { name: to.split('@')[0] ?? 'friend', appUrl },
  })

  return new Response(JSON.stringify(result), {
    headers: { 'content-type': 'application/json' },
  })
}
