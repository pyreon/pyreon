import type { ExprIR, StatementIR, ExtDecl } from '@pyreon/native-compiler/plugin-api'

export const FORM_PLUGIN = '@pyreon/form'
export const FORM_TYPE = 'form'
export const ARRAY_TYPE = 'fieldArray'
export const VALUES_TYPE = 'form-values'
export const ROW_TYPE = 'field-array-row'

export interface FormPayload {
  initialValues: { key: string; value: string }[]
  validators?: { key: string; param: string; body: ExprIR }[]
  onSubmit?: { param: string; body: StatementIR[] }
  schemaName?: string
}
export const formOf = (decl: ExtDecl): FormPayload => decl.payload as unknown as FormPayload
export const arrayOf = (decl: ExtDecl): { initial: string[] } =>
  decl.payload as unknown as { initial: string[] }
