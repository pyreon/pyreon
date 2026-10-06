import { NATIVE_COMPILER_PLUGIN_API_VERSION, type CompilerPlugin } from '../plugin'
import { BUILT_IN_SERVICE_OWNER, serviceSpecsOf } from '../service-registry'
import { SERVICES } from '../services'

/**
 * The compiler's own plain-service hooks (`SERVICES`) as a built-in plugin, so
 * they reach the registry through the same path a package-owned plugin's
 * `services` do. A discovered plugin of the same name replaces it.
 */
export const servicesPlugin: CompilerPlugin = Object.freeze({
  name: BUILT_IN_SERVICE_OWNER,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  builtIn: true,
  services: Object.freeze(serviceSpecsOf(SERVICES)),
})
