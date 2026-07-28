/** `atlas dev` — the workbench server and its virtual modules. Node only. */
export { generateCatalogModule, groupFor, slugify, toWorkbenchControl, uniqueIds } from './catalog-module'
export type { CatalogEntrySource, GenerateOptions } from './catalog-module'
export { atlasDevPlugin, builtinMethods, devHtml, CATALOG_ID, ENTRY_ID, RPC_PATH } from './plugin'
export type { AtlasDevPluginOptions, RpcContext, RpcMethod } from './plugin'
export { startDevServer } from './server'
export type { DevServerHandle, DevServerOptions } from './server'
