import { NATIVE_COMPILER_PLUGIN_API_VERSION, type CompilerPlugin } from '../plugin'
import { HOOKS_PLUGIN_MODULES, HOOKS_SERVICES } from '../built-in-services.generated'
import { BUILT_IN_SERVICE_OWNER } from '../service-registry'

/**
 * `@pyreon/hooks`' plain-service hooks as a built-in plugin — the generated copy
 * of the library's own plugin (`built-in-services.generated.ts`) — so they reach
 * the registry through the same path a package-owned plugin's `services` do.
 * The library's discovered plugin carries the same name and replaces it.
 */
export const servicesPlugin: CompilerPlugin = Object.freeze({
  name: BUILT_IN_SERVICE_OWNER,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  builtIn: true,
  modules: Object.freeze([...HOOKS_PLUGIN_MODULES]),
  services: Object.freeze(HOOKS_SERVICES),
})
