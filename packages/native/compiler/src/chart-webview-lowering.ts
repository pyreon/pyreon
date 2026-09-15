import { DEFAULT_CHART_WEBVIEW_HOST_HTML } from './generated-chart-webview-host'
import type { ExprIR } from './types'

type ElementIR = Extract<ExprIR, { kind: 'jsx-element' }>

export const CHART_WEBVIEW_HOST_PROPS = [
  'engineScript', 'engineSrc', 'theme', 'renderer', 'background', 'forwardEvents', 'hostSetupScript',
] as const

/** Source-ratcheted public surface consumed by both native emitters. */
export const HANDLED_CHART_WEBVIEW_PROPS: ReadonlySet<string> = new Set([
  'option', 'onSelect', 'commands', 'loading', 'loadingOptions', 'onEvent', 'onError', 'html',
  'engineScript', 'engineSrc', 'echartsScript', 'echartsSrc', 'theme', 'renderer', 'background',
  'forwardEvents', 'hostSetupScript',
])

export function legacyChartHostProp(name: string): string {
  return name === 'engineScript' ? 'echartsScript' : name === 'engineSrc' ? 'echartsSrc' : name
}

export function configureChartWebViewHost(
  element: ElementIR,
  readStatic: (element: ElementIR, name: string) => unknown,
  warn: (message: string) => void,
): string {
  let html = DEFAULT_CHART_WEBVIEW_HOST_HTML
  const present = (name: string): boolean =>
    element.attrs.some((attr) => attr.kind === 'attr' && attr.name === name)
  const read = (name: string): unknown => {
    const neutral = readStatic(element, name)
    return neutral === undefined ? readStatic(element, legacyChartHostProp(name)) : neutral
  }
  for (const prop of CHART_WEBVIEW_HOST_PROPS) {
    if ((present(prop) || present(legacyChartHostProp(prop))) && read(prop) === undefined) {
      warn(`<ChartWebView ${prop}={…}>: native host configuration must be statically resolvable; using the documented default.`)
    }
  }
  const safeScript = (value: string): string => value.replace(/<\//g, '<\\/').replace(/<!--/g, '<!\\--')
  const safeAttr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const script = read('engineScript')
  const source = read('engineSrc')
  if (typeof script === 'string') {
    html = html.replace(/<script src="[^"]*"><\/script>/, `<script>${safeScript(script)}</script>`)
  } else if (typeof source === 'string') {
    html = html.replace(/<script src="[^"]*"><\/script>/, `<script src="${safeAttr(source)}"></script>`)
  }
  const theme = read('theme')
  if (typeof theme === 'string') {
    html = html.replace(/([A-Za-z_$][\w$]*)\.init\(el, null,/, `$1.init(el, ${JSON.stringify(theme)},`)
  }
  if (read('renderer') === 'svg') html = html.replace("renderer: 'canvas'", "renderer: 'svg'")
  const background = read('background')
  if (typeof background === 'string') html = html.replace('background:transparent}', `background:${background.replace(/[<>"']/g, '')}}`)
  const events = read('forwardEvents')
  if (Array.isArray(events)) {
    const names = Array.from(new Set(events.filter((name): name is string => typeof name === 'string' && name.length > 0 && name !== 'click')))
    html = html.replace('var forwardedEvents = [];', `var forwardedEvents = ${JSON.stringify(names)};`)
  }
  const setup = read('hostSetupScript')
  if (typeof setup === 'string') {
    html = html.replace('</script><script>\n(function () {', `</script><script>${safeScript(setup)}</script><script>\n(function () {`)
  }
  return html
}
