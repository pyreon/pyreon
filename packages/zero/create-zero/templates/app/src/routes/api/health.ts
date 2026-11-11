/**
 * Health check endpoint — /api/health
 * Useful for load balancers and uptime monitoring.
 */
export function GET() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() })
}
