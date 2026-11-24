/**
 * zero's route-path predicate IS `@pyreon/server`'s — one rule for every base
 * decision on both sides (the server-island fragment URL in `@pyreon/server`,
 * every base check in zero). Re-exported, never copied, from the runtime-free
 * `@pyreon/server/paths` (zero's Node-side importers must not load the client
 * runtime);
 * `tests/route-path-drift.test.ts` fails if a copy reappears and diverges.
 */
export { isRoutePath } from '@pyreon/server/paths'
