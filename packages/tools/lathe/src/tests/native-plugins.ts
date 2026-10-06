// The libraries own their native lowering (`@pyreon/http`, `@pyreon/query`, `@pyreon/validate`, `@pyreon/validation` ship a plugin in their OWN
// package), so a test that compiles generated output through the REAL compiler has to load them the way
// `pyreon-native` does. These are the compiler's own entry points with the first-party plugins and their
// compile-gate stubs applied; every other export is re-exported untouched.
import {
  createCompiler,
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin as validateKotlinBase,
  validateKotlinFiles as validateKotlinFilesBase,
  validateSwiftFilesWithStubs as validateSwiftFilesBase,
  validateSwiftWithStubs as validateSwiftBase,
  type EmitOptions,
} from '@pyreon/native-compiler'
import httpPlugin from '@pyreon/http/native-plugin'
import queryPlugin, { queryStubs } from '@pyreon/query/native-plugin'
import validatePlugin from '@pyreon/validate/native-plugin'
import validationPlugin from '@pyreon/validation/native-plugin'

const compiler = createCompiler({ discovered: [httpPlugin, queryPlugin, validatePlugin, validationPlugin] })
const options = { augment: [queryStubs] }

export { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable }
export const transform = (source: string, emit: EmitOptions) => compiler.transform(source, emit)
export const validateSwiftWithStubs = (source: string) => validateSwiftBase(source, options)
export const validateKotlin = (source: string) => validateKotlinBase(source, options)
export const validateSwiftFilesWithStubs = (sources: readonly string[]) => validateSwiftFilesBase(sources, options)
export const validateKotlinFiles = (sources: readonly string[]) => validateKotlinFilesBase(sources, options)
