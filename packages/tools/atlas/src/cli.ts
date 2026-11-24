/**
 * Subpath entry for `@pyreon/atlas/cli` (dev/build-time, Node only). The build
 * derives this entry from the export KEY; the modules live in the `cli/` folder.
 */
import { exitAfterFlush as flushThenExit } from '@pyreon/ansi'

export * from './cli/run'
/**
 * For the hand-written `bin/atlas.js`, which cannot import the private,
 * bundled `@pyreon/ansi`: exit once stdout/stderr have flushed (#4799).
 * @internal
 */
export function exitAfterFlush(code: number): Promise<never> {
  return flushThenExit(code)
}
