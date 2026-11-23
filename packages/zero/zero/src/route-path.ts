/**
 * zero's route-path predicate IS `@pyreon/server`'s — one rule for every base
 * decision on both sides (the server-island fragment URL in `@pyreon/server`,
 * every base check in zero). Re-exported, never copied;
 * `tests/route-path-drift.test.ts` fails if a copy reappears and diverges.
 */
export { isRoutePath } from '@pyreon/server/client'
