/**
 * Regression test for the dev-vs-prod 404 drift bug.
 *
 * Before the fix: an app configured with `mode: 'ssg'` (or `'spa'`) would
 * see the bare static fallback (`<h1>404 — Not Found</h1>`) on any
 * unmatched URL in dev, even when the user shipped a `_404.tsx` /
 * `_not-found.tsx` in their routes. The SSG-built `dist/404.html` rendered
 * the branded version correctly — but dev didn't, so developers iterating
 * on the 404 page locally saw a stripped fallback that never matched what
 * production shipped.
 *
 * The fix: `handle404` now delegates to `renderSsr` (which calls the
 * router's `findNotFoundFallback` walker). For ssg/spa modes this is the
 * first time the user's `_404.tsx` reaches the dev render path; for ssr
 * mode the upstream SSR middleware still catches the 404 first
 * (no double-render in the matched-component case).
 *
 * Bisect-verified: reverting handle404 to call `render404Page(undefined)`
 * unconditionally fails the "uses the user's _404 component" spec with
 * `expected '<h1>404 — Page Not Found</h1>' to contain 'Page Not Found'`
 * — the bare fallback emits a generic body without the user's heading.
 */
import { resolve } from "node:path";
import pyreon from "@pyreon/vite-plugin";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zeroPlugin } from "../../vite-plugin";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixture");

let server: ViteDevServer;
let baseUrl: string;

beforeAll(async () => {
	server = await createServer({
		root: FIXTURE_DIR,
		configFile: false,
		// Configure as `mode: 'ssg'` — the failure mode from the bug report.
		// The dev SSR middleware is GATED on `mode === 'ssr'`, so this mode
		// has only the `handle404` fallback path for unmatched URLs.
		plugins: [pyreon(), zeroPlugin({ mode: "ssg" })],
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

describe("dev 404 — mode: 'ssg' uses user's _404.tsx (regression)", () => {
	it("uses the user's _404 component on an unmatched URL", async () => {
		const res = await fetch(`${baseUrl}/this-route-does-not-exist`);
		expect(res.status).toBe(404);
		const html = await res.text();
		// The fixture's `_404.ts` renders `<h1>404 — Page Not Found</h1>` and
		// `<p>The page you are looking for does not exist.</p>` — strings
		// UNIQUE to the user's component (not present in `DEFAULT_404_BODY`,
		// which uses "Not Found" + "The page you requested does not exist").
		expect(html).toContain("Page Not Found");
		expect(html).toContain("looking for");
	});

	it("emits the user's _404 component WRAPPED in the layout/app chrome", async () => {
		const res = await fetch(`${baseUrl}/another-unmatched-path`);
		expect(res.status).toBe(404);
		const html = await res.text();
		// The render goes through renderSsr → createApp → renderWithHead, so
		// the doctype + html/head/body skeleton from the user's index.html
		// template must be present (not just the bare DEFAULT_404_BODY).
		expect(html).toContain("<!DOCTYPE html>");
		expect(html.toLowerCase()).toContain("<html");
		expect(html.toLowerCase()).toContain("<body");
	});

	it("known routes still serve normally (not 404)", async () => {
		// Smoke test that the new render path doesn't accidentally claim
		// matched URLs are 404s.
		const aboutRes = await fetch(`${baseUrl}/about`);
		// In ssg mode the dev server doesn't pre-render matched routes
		// server-side (Vite serves the SPA shell), so status is 200.
		expect(aboutRes.status).toBe(200);
	});

	it("path with deeply-nested segments still routes through _404", async () => {
		const res = await fetch(`${baseUrl}/foo/bar/baz/qux`);
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("Page Not Found");
	});

	it("static-asset-shaped paths fall through (don't hit handle404)", async () => {
		// `/foo.css` has a file extension and the middleware skips it via
		// `if (/\.\w+$/.test(pathname)) return next()`. The 404 handler
		// should not produce HTML for it — Vite's static handling does.
		const res = await fetch(`${baseUrl}/foo.css`);
		// Vite returns 404 with a plain "Not found" or similar for missing
		// static files — NOT the rendered user component.
		const html = await res.text()
		expect(html).not.toContain("Page Not Found")
	});
});
