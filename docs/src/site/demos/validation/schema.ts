import { s } from '@pyreon/validate'

/**
 * The one schema the Validation demo shares between "browser" and "server".
 * The client bundle carries only the KEY of the uniqueness check; its
 * implementation is registered in the server half (server.worker.ts).
 */
export const Signup = s.object({
  email: s.string().email({ message: 'Enter a valid email address' }).serverCheck('email-unique', { message: 'This email is already registered' }),
})

/** What the server half answers for one value. */
export interface ServerVerdict {
  /** `strictEmail()`: RFC 5322 and not a disposable domain. */
  strict: 'pass' | 'fail' | 'fail · disposable'
  /** The registered `email-unique` check, as `parseAsync` ran it. */
  unique: 'pass' | 'fail · taken' | 'skipped'
  /** The issue messages `Signup.parseAsync` returned. */
  issues: string[]
}

export const TAKEN = 'ada@example.com'
export const SERVER_LATENCY_MS = 700
