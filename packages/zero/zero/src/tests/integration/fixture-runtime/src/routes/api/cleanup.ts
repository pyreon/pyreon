export const schedule = '0 3 * * *'

export function GET() {
  return Response.json({ cleaned: true })
}
