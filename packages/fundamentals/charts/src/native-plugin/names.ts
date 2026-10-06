/**
 * Names the `@pyreon/charts` plugin's two halves share — kept apart from the
 * plugin entry so the emitters under this directory can import them without
 * importing the entry that imports the emitters.
 */

export const CHARTS_PLUGIN_NAME = '@pyreon/charts'
export const CHART_HANDLE_TYPE = 'chart-handle'

/**
 * The Swift constructor argument is the bound chart's series count, which only
 * the BODY emit knows. The declaration embeds a deferred token under this key
 * (`ctx.deferred`) and the `<PlotChart handle>` host resolves it
 * (`ctx.resolveDeferred`) once it has counted its marks. `ident` is the handle's
 * emitted identifier, so both sides agree even when the name needed escaping.
 */
export const chartHandleSeriesKey = (ident: string): string => `${CHARTS_PLUGIN_NAME}/series/${ident}`
