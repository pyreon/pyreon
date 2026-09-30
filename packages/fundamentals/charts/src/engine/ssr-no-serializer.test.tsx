// @vitest-environment node
// Without `@pyreon/charts/svg` imported, the server ships no first frame (the
// serializer is not in the bundle) — but the chart still renders, and the
// accessible table is still in the HTML.
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { expect, it } from 'vitest'
import { Bar, Chart } from './grammar'

it('renders without a first-frame SVG, and still with the table', async () => {
  const html = await renderToString(h(Chart<{ m: string; v: number }>, { data: [{ m: 'a', v: 1 }], x: 'm', width: 200, height: 100 }, h(Bar, { y: 'v' })))
  expect(html).toContain('data-pyreon-chart-frame=""')
  expect(html).not.toContain('<svg')
  expect(html).toContain('<th scope="row">a</th>')
})
