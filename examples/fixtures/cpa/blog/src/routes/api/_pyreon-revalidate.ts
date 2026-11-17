import { vercelRevalidateHandler } from "@pyreon/zero/server"

/**
 * Build-time ISR webhook (M3.1 reference). Drop-in handler that
 * `vercelAdapter.revalidate(path)` calls on every CMS publish.
 *
 * The handler validates POST + path + secret BEFORE looking at the path,
 * then refuses revalidation for paths NOT in `dist/_pyreon-revalidate.json`
 * — that manifest is the authoritative allowlist, so a leaked
 * `VERCEL_REVALIDATE_TOKEN` can't be turned into "revalidate any URL"
 * cost-amplification attack.
 *
 * Deploy steps:
 *   1. Set `VERCEL_REVALIDATE_TOKEN` (any random string) in the Vercel
 *      project's environment variables.
 *   2. Set `VERCEL_DEPLOYMENT_URL` to your deployed origin.
 *   3. When a CMS publishes, the deploy adapter POSTs here. The handler
 *      validates the secret + manifest membership, then `onRevalidate`
 *      fires the platform-specific revalidation (Vercel's `res.revalidate`,
 *      Cloudflare cache purge, etc.).
 *
 * The handler returns a Web-standard `Response`, so it works in Vercel
 * Edge functions, Node serverless, and the in-process `mode: 'ssr'`
 * runtime.
 */
const handler = vercelRevalidateHandler({
  onRevalidate: async (path) => {
    // Replace this no-op with the platform-specific revalidation call.
    // Example for Vercel:
    //   await fetch(`https://api.vercel.com/v1/projects/${PROJECT_ID}/revalidate`, {
    //     method: 'POST',
    //     headers: { Authorization: `Bearer ${VERCEL_API_TOKEN}` },
    //     body: JSON.stringify({ path }),
    //   })
    console.log(`[revalidate] ${path}`)
  },
})

export function POST(ctx: { request: Request }) {
  return handler(ctx.request)
}
