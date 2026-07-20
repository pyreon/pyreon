// `<PyreonUI>` reads unistyle's theme engine through the registration seam
// (see src/theme-engine.ts) — ui-core carries NO dependency on unistyle, so
// its tests must load unistyle explicitly to register the engine, exactly as a
// real app does transitively (every styled @pyreon UI package pulls it in).
// `@pyreon/unistyle` is a devDependency here for this reason only.
import '@pyreon/unistyle'
