/**
 * `zero doctor` command wiring.
 *
 * Regression for the 0.50.0 defect: `zero doctor` printed "audit-types (enable
 * with --full)" in its Skipped list, but the cac command declared only
 * --fix/--json/--ci — so `zero doctor --full` threw `CACError: Unknown option
 * --full` and `full` was never forwarded to `@pyreon/cli`'s `runDoctor`, making
 * the audit-types + bundle-budgets gates permanently unreachable through zero.
 */
import { describe, expect, it, vi } from 'vitest'

const runDoctor = vi.fn(async (_opts: Record<string, unknown>) => 0)
vi.mock('@pyreon/cli', () => ({ doctor: runDoctor }))

import { doctor } from './doctor'

describe('zero doctor — --full forwarding', () => {
  it('forwards --full to runDoctor so the slow gates (audit-types, bundle-budgets) can run', async () => {
    runDoctor.mockClear()
    await doctor('.', { full: true })
    expect(runDoctor).toHaveBeenCalledTimes(1)
    expect(runDoctor.mock.calls[0]![0]).toMatchObject({ full: true })
  })

  it('defaults full to false when the flag is absent (fast run)', async () => {
    runDoctor.mockClear()
    await doctor('.', {})
    expect(runDoctor.mock.calls[0]![0]).toMatchObject({ full: false })
  })

  it('still forwards the other flags', async () => {
    runDoctor.mockClear()
    await doctor('.', { fix: true, json: true, ci: false, full: true })
    expect(runDoctor.mock.calls[0]![0]).toMatchObject({
      fix: true,
      json: true,
      ci: false,
      full: true,
    })
  })
})
