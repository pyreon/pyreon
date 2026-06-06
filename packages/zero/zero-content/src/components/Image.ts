// ─── Built-in `<Image>` for markdown content ──────────────────────────────
//
// PR-F audit H7 — pre-fix every local image (`![alt](./hero.png)`) emitted
// as a plain `<img>`, bypassing zero's image-optimization pipeline. The
// emit-jsx layer now rewrites local images to `<Image src={import('./hero.png?optimize')} ...>`;
// this file re-exports `@pyreon/zero`'s `<Image>` so the auto-imported
// component name resolves through `virtual:zero-content/components`.
//
// Re-export is layer-pure — zero is already a peer dep, so no new
// runtime coupling beyond what the consumer already pays.
export { Image } from '@pyreon/zero'
