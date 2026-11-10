/**
 * `render404Page` splices the rendered 404 body into the app template. As a
 * replacement STRING, `String.prototype.replace` expands `$&`, `` $` `` and
 * `$$` in it (`$'` cannot survive: SSR escapes the apostrophe), so page text
 * such as `$&` re-inserted the placeholder and `` $` `` pulled in the whole
 * template before it. A function replacer inserts the body verbatim — the same
 * rule `@pyreon/server`'s `processTemplate` follows.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { render404Page } from '../not-found'

describe('render404Page — template injection', () => {
	it('inserts a body containing $-patterns verbatim', async () => {
		const Custom = () => h('p', null, "Was $' now $` and $& and $$")
		const template = '<!DOCTYPE html><html><head></head><body><div id="app"><!--pyreon-app--></div></body></html>'
		const html = await render404Page(Custom, template)
		expect(html).toContain("<p>Was $&#39; now $` and $&amp; and $$</p></div></body></html>")
		expect(html.match(/<!DOCTYPE html>/g)).toHaveLength(1)
	})
})
