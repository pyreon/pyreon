/**
 * `@pyreon/charts/option-layer` — the ECharts dataset pipeline as a pure
 * function, for consumers that resolve an option WITHOUT rendering it.
 *
 * `@pyreon/native-compiler` runs `resolveDataset` at COMPILE time over a
 * literal `<OptionChart option>`: the same `source` / `dimensions` /
 * `sourceHeader` / `encode` / built-in `filter` + `sort` transforms that the
 * web facade resolves at runtime, so a dataset-driven option names the same
 * datums on web, iOS and Android. Registered custom transforms live in the
 * page's registry and run on the web only.
 *
 * Deliberately NOT the `/plot` barrel: that entry pulls the components and
 * the JSX runtime, which a build tool has no use for.
 */
export { applyTransforms, applyTransformsAll, graphicElements, listChartTransforms, readSource, registerChartTransform, resolveDataset, unregisterChartTransform } from './engine/option-layer'
export { graphicDrawCommands, graphicElementCommands } from './engine/graphic'
export type { GraphicElement } from './engine/graphic'
export type { ChartTransform, ChartTransformDimension, ChartTransformParams, ChartTransformResult, ChartTransformUpstream, Table } from './engine/option-layer'
export { labelFields } from './engine/option'
export { plain } from './engine/format'
export type { RichStyle } from './engine/labels'
export type { OptionWarning } from './engine/option'
export { LARGE_THRESHOLD, PROGRESSIVE_THRESHOLD, decimateShared, samplingRequest } from './engine/sampling'
export type { SamplingMethod, SamplingRequest, SharedRows } from './engine/sampling'
