import { defineNodeConfig } from '@pyreon/vitest-config'

/**
 * The example's tests exercise the GENERATED dev surface — the faker factories
 * and the fixture table — against the schemas emitted by the same run.
 *
 * Coverage thresholds are set to 0 rather than left at the category default:
 * there is no first-party source here to cover. Every file under `src/gen` is
 * generated, and its correctness is asserted by `@pyreon/lathe`'s own suite.
 * What these tests prove is something that suite structurally cannot — that a
 * CONSUMER can reach and use the output, by the same import paths a real
 * project would write.
 */
export default defineNodeConfig({
  category: 'tools',
  coverageThresholds: { statements: 0, branches: 0, functions: 0, lines: 0 },
})
