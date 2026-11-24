// ─── @pyreon/zero/actions ───────────────────────────────────────────────────
//
// Public entry: server actions (`defineAction`), the action middleware, and
// progressive-enhancement forms (`<Form>`, `useSubmission`). The
// implementation lives in `actions-core.ts` and `form.tsx`; their
// `_`-prefixed internals are on `@pyreon/zero/internal`, not here.

export type {
  Action,
  ActionContext,
  ActionData,
  ActionFailure,
  ActionHandler,
  ActionInputError,
  ActionOutcome,
  ActionPayload,
  CreateActionMiddlewareOptions,
  ResolvedActionOptions,
  StandardSchemaV1,
} from './actions-core'
export {
  ACTION_REDIRECT_HEADER,
  checkActionOrigin,
  createActionMiddleware,
  DEFAULT_ACTION_BODY_LIMIT,
  defineAction,
  fail,
  getRegisteredActions,
  isActionFailure,
  readActionPayload,
  resolveActionOptions,
  runActionHandler,
} from './actions-core'
export type {
  ActionSnapshot,
  EnhancedActionResponse,
  FormProps,
  Submission,
  SubmitOptions,
} from './form'
export {
  ACTION_QUERY_PARAM,
  ENHANCED_ACTION_HEADER,
  Form,
  formActionSearch,
  useSubmission,
} from './form'
