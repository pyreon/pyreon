import type { CompilerPlugin } from '@pyreon/native-compiler/plugin-api'
import { formStubs } from './stubs'
import { formDecl, fieldArrayDecl } from './emit'
import { recognizeForm, recognizeFieldArray, recognizeFormState, recognizeWatch } from './recognize'
import { formStateExpr, watchExpr } from './exprs'
import {
  formReceiver,
  valuesReceiver,
  arrayReceiver,
  rowReceiver,
  formValueBinding,
} from './receivers'
import { FORM_PLUGIN, FORM_TYPE, ARRAY_TYPE, VALUES_TYPE, ROW_TYPE, STATE_EXPR, WATCH_EXPR } from './types'

export const formPlugin: CompilerPlugin = Object.freeze({
  name: FORM_PLUGIN,
  apiVersion: 2,
  modules: [FORM_PLUGIN],
  stubs: formStubs,
  destructureCalls: ['useForm'],
  calls: {
    useForm: recognizeForm,
    useFieldArray: recognizeFieldArray,
    useWatch: recognizeWatch,
    useFormState: recognizeFormState,
  },
  exprs: { [WATCH_EXPR]: watchExpr, [STATE_EXPR]: formStateExpr },
  decls: {
    [FORM_TYPE]: { ...formDecl, valueBinding: formValueBinding },
    [ARRAY_TYPE]: fieldArrayDecl,
    [VALUES_TYPE]: { swift: () => '', kotlin: () => '' },
    [ROW_TYPE]: { swift: () => '', kotlin: () => '' },
  },
  receivers: {
    [FORM_TYPE]: formReceiver,
    [ARRAY_TYPE]: arrayReceiver,
    [VALUES_TYPE]: valuesReceiver,
    [ROW_TYPE]: rowReceiver,
  },
})
