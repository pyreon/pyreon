/// <reference lib="webworker" />
import { isDisposableEmail, registerServerCheck, strictEmail } from '@pyreon/validate/server'
import { SERVER_LATENCY_MS, Signup, TAKEN, type ServerVerdict } from './schema'

/**
 * The SERVER half of the Validation demo, in a Web Worker: its own module
 * graph, so importing `@pyreon/validate/server` (which installs the strict
 * email validator into the format registry) upgrades validation HERE and
 * never in the page's own copy, exactly as on a real server. Only the
 * network and the user table are simulated.
 */
registerServerCheck('email-unique', async (value) => String(value).toLowerCase() !== TAKEN)

self.onmessage = async (e: MessageEvent<{ id: number; email: string }>) => {
  const { id, email } = e.data
  // A pretend round-trip.
  // pyreon-lint-disable-next-line pyreon/no-raw-setinterval
  await new Promise((r) => setTimeout(r, SERVER_LATENCY_MS))
  const strictOk = strictEmail(email)
  const result = await Signup.parseAsync({ email })
  const issues = result.ok ? [] : result.issues.map((i) => i.message)
  const verdict: ServerVerdict = {
    strict: strictOk ? 'pass' : isDisposableEmail(email) ? 'fail · disposable' : 'fail',
    unique: !strictOk ? 'skipped' : issues.includes('This email is already registered') ? 'fail · taken' : 'pass',
    issues,
  }
  self.postMessage({ id, verdict })
}
