// ─── @pyreon/zero/actions ───────────────────────────────────────────────────
//
// Public entry: server actions (`defineAction`), the action middleware, and
// progressive-enhancement forms (`<Form>`, `useSubmission`). The
// implementation lives in `actions-core.ts` and `form.tsx`; their
// internals (the `_`-prefixed seams and the request-handling helpers the
// middleware shares) are on `@pyreon/zero/internal`, not here.

export type {
  Action,
  ActionContext,
  ActionData,
  ActionFailure,
  ActionHandler,
  ActionInputError,
  CreateActionMiddlewareOptions,
  StandardSchemaV1,
} from './actions-core'
export {
  createActionMiddleware,
  DEFAULT_ACTION_BODY_LIMIT,
  defineAction,
  fail,
  getRegisteredActions,
  isActionFailure,
} from './actions-core'
export type {
  FormProps,
  Submission,
  SubmitOptions,
} from './form'
export { Form, useSubmission } from './form'
