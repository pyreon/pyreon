/**
 * Passport bridge (server only). Runs ANY Passport strategy without Express or passport itself:
 * the strategy is cloned, its `success/fail/redirect/pass/error` hooks are bound to a promise,
 * and `authenticate()` is called with a minimal request. Passport is not a dependency.
 */

export interface PassportStrategyLike {
  authenticate(req: PassportRequest, options?: Record<string, unknown>): void
}

export interface PassportRequest {
  method: string
  url: string
  headers: Record<string, string>
  query: Record<string, string>
  body: Record<string, unknown>
  /** Strategies such as passport-oauth2 keep state/verifier here; back it with the pending-flow store. */
  session: Record<string, unknown>
}

export type PassportOutcome =
  | { type: 'success'; user: unknown; info?: unknown | undefined }
  | { type: 'fail'; challenge?: unknown | undefined; status?: number | undefined }
  | { type: 'redirect'; url: string; status: number }
  | { type: 'pass' }

export interface PassportInput {
  method?: string
  url: string
  headers?: Record<string, string>
  body?: Record<string, unknown>
  session?: Record<string, unknown>
}

/** Run one `authenticate()` attempt and resolve with its outcome. Rejects only on a strategy `error()`. */
export function runStrategy(
  strategy: PassportStrategyLike,
  input: PassportInput,
  options?: Record<string, unknown>,
): Promise<PassportOutcome> {
  const url = new URL(input.url, 'http://localhost')
  const req: PassportRequest = {
    method: input.method ?? 'GET',
    url: input.url,
    headers: Object.fromEntries(Object.entries(input.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
    query: Object.fromEntries(url.searchParams),
    body: input.body ?? {},
    session: input.session ?? {},
  }
  return new Promise((resolve, reject) => {
    const s = Object.create(strategy) as PassportStrategyLike & Record<string, unknown>
    s.success = (user: unknown, info?: unknown) => resolve({ type: 'success', user, info })
    s.fail = (challenge?: unknown, status?: number) => resolve({ type: 'fail', challenge, status })
    s.redirect = (u: string, status = 302) => resolve({ type: 'redirect', url: u, status })
    s.pass = () => resolve({ type: 'pass' })
    s.error = (err: unknown) => reject(err instanceof Error ? err : new Error(`[Pyreon] auth: passport strategy error: ${String(err)}`))
    try {
      s.authenticate(req, options)
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}
