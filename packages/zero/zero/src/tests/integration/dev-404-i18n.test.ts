/**
 * Regression test: dev 404 in `mode: 'ssg'` with i18n route duplication.
 *
 * Per PR H, `zeroPlugin({ i18n: { locales: [...], defaultLocale } })`
 * duplicates the route tree per locale via `expandRoutesForLocales`.
 * Each duplicate carries its own `_404.tsx` via the layout's
 * `notFoundComponent` attribute. Per PR K, the SSG plugin walks the
 * per-locale subtrees and emits `dist/{locale}/404.html` for each.
 *
 * In dev: `findNotFoundFallback` (router/match.ts) walks the duplicated
 * route tree and finds the deepest matching locale-prefixed layout with
 * a `notFoundComponent`. So `/de/unknown` and `/about-not-a-route` both
 * resolve to the user's `_404.tsx` content with the layout chrome.
 *
 * Pre-fix this never worked in dev for `mode: 'ssg'` (the bare HTML
 * fallback fired regardless). The new `renderSsr` delegation in
 * `handle404` makes the per-locale walker reachable.
 */
import { resolve } from "node:path";
import pyreon from "@pyreon/vite-plugin";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zeroPlugin } from "../../vite-plugin";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixture-i18n-404");

let server: ViteDevServer;
let baseUrl: string;

beforeAll(async () => {
	server = await createServer({
		root: FIXTURE_DIR,
		configFile: false,
		plugins: [
			pyreon(),
			zeroPlugin({
				mode: "ssg",
				i18n: {
					locales: ["en", "de", "cs"],
					defaultLocale: "en",
				},
			}),
		],
		resolve: { conditions: ["bun"] },
		ssr: { resolve: { conditions: ["bun"] } },
		optimizeDeps: {
			exclude: [
				"@pyreon/core",
				"@pyreon/reactivity",
				"@pyreon/router",
				"@pyreon/runtime-dom",
				"@pyreon/runtime-server",
				"@pyreon/head",
				"@pyreon/server",
				"@pyreon/vite-plugin",
			],
		},
		server: { port: 0 },
		logLevel: "silent",
	});
	await server.listen();
	const address = server.httpServer?.address();
	if (address && typeof address === "object") {
		baseUrl = `http://localhost:${address.port}`;
	}
}, 30_000);

afterAll(async () => {
	await server?.close();
});

describe("dev 404 — i18n route duplication (`mode: 'ssg' + i18n config`)", () => {
	it("default-locale unprefixed unmatched URL uses _404 with layout chrome", async () => {
		const res = await fetch(`${baseUrl}/totally-unknown`);
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("i18n Not Found");
		// Layout chrome must wrap the 404 component.
		expect(html).toContain('data-i18n-layout="root"');
		expect(html).toContain("i18n root layout");
	});

	it("non-default-locale prefixed unmatched URL (`/de/X`) uses _404", async () => {
		// `prefix-except-default` (the default strategy): non-default
		// locales get explicit prefixes. `/de/unknown` should hit the
		// de-locale layout's notFoundComponent.
		const res = await fetch(`${baseUrl}/de/this-route-doesnt-exist`);
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("i18n Not Found");
		expect(html).toContain('data-i18n-layout="root"');
	});

	it("third-locale prefixed unmatched URL also routes through _404", async () => {
		// Lock multi-locale coverage — not just `de`.
		const res = await fetch(`${baseUrl}/cs/missing-page`);
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("i18n Not Found");
	});

	it("matched root index (default locale) serves 200", async () => {
		const res = await fetch(`${baseUrl}/`);
		expect(res.status).toBe(200);
	});
});
