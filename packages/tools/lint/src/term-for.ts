/**
 * The `Term` for a formatter's terminal choices. Kept out of `reporter.ts`
 * so no public declaration names an `@pyreon/ansi` type: that package is
 * private and inlined at build, so a `.d.ts` that imported from it would
 * not resolve for consumers.
 */
import { createTerm, type Term, term as defaultTerm } from '@pyreon/ansi'
import type { TermChoice } from './reporter'

/** The process's stdout when nothing is chosen; otherwise a `Term` for exactly those choices. */
export const termFor = (opts: TermChoice): Term =>
  opts.color === undefined && opts.theme === undefined && opts.unicode === undefined && opts.width === undefined
    ? defaultTerm
    : createTerm({ level: opts.color, theme: opts.theme, unicode: opts.unicode, width: opts.width })
