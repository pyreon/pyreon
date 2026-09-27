// Dotted API URL — `/api/files/report.csv`. The dev API dispatcher used to
// skip every extension-bearing path, so this 404'd in dev and worked in prod.
export function GET({ params }: { params: Record<string, string> }) {
  return Response.json({ name: params.name })
}
