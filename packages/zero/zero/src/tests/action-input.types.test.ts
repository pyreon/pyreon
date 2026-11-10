/**
 * Compile-time regression: an action defined with an input schema
 * (`defineAction(schema, handler)`) carries its input type as `Action<T, TInput>`.
 * A call signature's parameter is checked contravariantly, so such an action is
 * NOT assignable to `Action<T>` (= `Action<T, unknown>`). `useSubmission` and
 * `<Form>` must therefore accept any input type, or every schema-validated action
 * fails to typecheck where it is used (TS2345 on `useSubmission(action)`, TS2322
 * on `<Form action={action}>`).
 *
 * Typechecked via `tsconfig.types-tests.json` (the package `typecheck` script).
 * Bisect: with `useSubmission<T>(action: Action<T>)` / `FormProps<T>` restored,
 * this file fails with TS2345 on `useSubmission(typed)` and TS2322 on
 * `Form({ action: typed })`.
 */
import type { StandardSchemaV1 } from '../actions'
import { defineAction } from '../actions'
import { Form, useSubmission } from '../form'

const schema: StandardSchemaV1<{ email: string }, { email: string }> = {
  '~standard': {
    version: 1,
    vendor: 'types-test',
    validate: (value) => ({ value: value as { email: string } }),
  },
}

const typed = defineAction(schema, async (input) => ({ welcome: input.email }))

// Never invoked: these only have to compile.
function typedActionIsAcceptedEverywhere(): void {
  const sub = useSubmission(typed)
  const result = sub.result()
  if (result && 'welcome' in result) {
    const welcome: string = result.welcome
    void welcome
  }
  void Form({ action: typed })
}

describe('a schema-validated action is accepted by useSubmission and <Form>', () => {
  it('compiles (the assertion is the typecheck)', () => {
    expect(typeof typedActionIsAcceptedEverywhere).toBe('function')
    expect(typeof typed.actionId).toBe('string')
  })
})
