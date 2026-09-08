/**
 * Regression test: dev 404 in `mode: 'ssg'` when the user's `_404.tsx` has
 * NO sibling `_layout.tsx`.
 *
 * The router's `findNotFoundFallback` (PR L5 + the layout-less follow-up
 * documented in `match.ts:712-779`) has TWO walker passes:
 *   1. Layout pass: find a parent layout with `notFoundComponent`.
 *   2. Page-level fallback: if no layout matches, accept a page-record
 *      `notFoundComponent` and synthesize a `DefaultChromeLayout`
 *      wrapper so the synthetic leaf still gets a `<RouterView />` to
 *      render into.
 *
 * Without the page-level fallback, layout-less `_404.tsx` would slip
 * through the layout-only pass and fall to the bare HTML. This test
 * locks in the second-pass behaviour against my handle404 → renderSsr
 * delegation.
 */
import { resolve } from "node:path";
import pyreon from "@pyreon/vite-plugin";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zeroPlugin } from "../../vite-plugin";
import {
	DEV_SERVER_BOOT_TIMEOUT_MS,
	DEV_SERVER_TEST_TIMEOUT_MS,
	devFetch,
} from "./dev-server-budget";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixture-layoutless-404");

let server: ViteDevServer;
let baseUrl: string;

// Snapshot for `devFetch`'s failure message — a thunk, so it costs nothing on
// the passing path and only runs when a request has already failed.
const state = () =>
	`baseUrl=${baseUrl} viteListening=${Boolean(server?.httpServer?.listening)}`;

beforeAll(async () => {
	server = await createServer({
		root: FIXTURE_DIR,
		configFile: false,
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
}, DEV_SERVER_BOOT_TIMEOUT_MS);

afterAll(async () => {
	await server?.close();
});

describe("dev 404 — layout-less `_404.tsx` (no parent `_layout.tsx`)", { timeout: DEV_SERVER_TEST_TIMEOUT_MS }, () => {
	it("uses the user's _404 component on unmatched URL", async () => {
		const res = await devFetch(
			`${baseUrl}/this-does-not-exist`,
			"layout-less _404 render on an unmatched URL",
			{ observe: state },
		);
		expect(res.status).toBe(404);
		const html = await res.text();
		// The fixture's `_404.ts` carries unique content.
		expect(html).toContain("Layoutless Not Found");
		expect(html).toContain("layout-less variant");
	});

	it("wraps the layout-less _404 in the DefaultChromeLayout (semantic <main>)", async () => {
		// PR L5 follow-up: when the second-pass page-level fallback fires,
		// the router synthesizes a `DefaultChromeLayout` that renders
		// `<main data-pyreon-default-chrome>` around the leaf component.
		// This gives accessibility / SEO landmarks even without a user-
		// defined layout.
		const res = await devFetch(
			`${baseUrl}/foo/bar`,
			"layout-less _404 wrapped in DefaultChromeLayout",
			{ observe: state },
		);
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("data-pyreon-default-chrome");
	});

	it("doctype + html/body present (renderSsr produced full doc, not bare)", async () => {
		const res = await devFetch(
			`${baseUrl}/another-path`,
			"layout-less _404 renders a full document",
			{ observe: state },
		);
		const html = await res.text();
		expect(html).toContain("<!DOCTYPE html>");
		expect(html.toLowerCase()).toContain("<html");
		expect(html.toLowerCase()).toContain("<body");
	});
});
